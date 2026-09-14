"""Connexion du personnel, du portail élève, et création d'une auto-école."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field

from lib.autorisation import Session
from lib.config import Config
from lib.db import ECOLES, ELEVES, UTILISATEURS, pour_mongo, sans_mongo_id
from lib.deps import config_courante, db, session_courante, verrou_connexion
from lib.securite import (
    VerrouConnexion,
    bruler_temps_secret,
    creer_jeton,
    hacher_secret,
    verifier_secret,
)
from models.communs import Cote, EntreeBase, NomCourt, Role, maintenant, normaliser_telephone
from models.ecole import Ecole, Utilisateur, en_public

routeur = APIRouter(prefix="/api/auth", tags=["authentification"])


class DemandeInscription(EntreeBase):
    """Création d'une auto-école et de son compte directeur."""

    nomEcole: NomCourt
    commune: str = Field(default="", max_length=120)
    nomDirecteur: NomCourt
    telephone: str = Field(max_length=20)
    motDePasse: str = Field(min_length=8, max_length=128)


class DemandeConnexion(EntreeBase):
    telephone: str = Field(max_length=20)
    motDePasse: str = Field(min_length=1, max_length=128)


class DemandePortail(EntreeBase):
    jeton: str = Field(min_length=8, max_length=200)


def _identifiants_invalides() -> HTTPException:
    # Message volontairement identique pour un numéro inconnu et un mauvais
    # mot de passe : distinguer les deux révélerait quels comptes existent.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Numéro ou mot de passe incorrect.",
    )


def _jeton_personnel(u: dict, config: Config) -> str:
    return creer_jeton(
        {
            "sub": u["id"],
            "ecoleId": u["ecoleId"],
            "cote": Cote.ECOLE.value,
            "role": u["role"],
            "nom": u.get("nom", ""),
        },
        config.jwt_secret,
        duree=timedelta(minutes=config.jwt_expire_minutes),
    )


@routeur.post("/inscription", status_code=status.HTTP_201_CREATED)
async def inscrire_ecole(
    demande: DemandeInscription,
    base: Any = Depends(db),
    config: Config = Depends(config_courante),
) -> dict:
    """Crée une auto-école et son directeur. Point d'entrée d'un nouveau client."""
    try:
        telephone = normaliser_telephone(demande.telephone)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    if await base[UTILISATEURS].find_one({"telephone": telephone}):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ce numéro est déjà associé à un compte.",
        )

    ecole = Ecole(ecoleId="", nom=demande.nomEcole, commune=demande.commune)
    # Une école est son propre tenant : son ecoleId est son id.
    doc_ecole = ecole.model_dump()
    doc_ecole["ecoleId"] = ecole.id
    await base[ECOLES].insert_one(pour_mongo(doc_ecole))

    directeur = Utilisateur(
        ecoleId=ecole.id,
        nom=demande.nomDirecteur,
        telephone=telephone,
        role=Role.DIRECTEUR,
        empreinte=hacher_secret(demande.motDePasse),
    )
    doc_dir = directeur.model_dump()
    doc_dir["empreinte"] = directeur.empreinte  # exclu du dump, réinjecté
    await base[UTILISATEURS].insert_one(pour_mongo(doc_dir))

    return {
        "jeton": _jeton_personnel(doc_dir, config),
        "utilisateur": en_public(directeur).model_dump(),
        "ecole": {"id": ecole.id, "nom": ecole.nom},
    }


@routeur.post("/connexion")
async def connexion(
    demande: DemandeConnexion,
    base: Any = Depends(db),
    config: Config = Depends(config_courante),
    verrou: VerrouConnexion = Depends(verrou_connexion),
) -> dict:
    identifiant = (demande.telephone or "").strip()

    attente = verrou.verifier(identifiant)
    if attente:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives. Réessayez dans {attente // 60 + 1} minute(s).",
        )

    try:
        telephone = normaliser_telephone(identifiant)
    except ValueError:
        # Même coût qu'un vrai échec : sinon la rapidité de la réponse
        # distingue un numéro mal formé d'un numéro inconnu.
        bruler_temps_secret()
        verrou.noter_echec(identifiant)
        raise _identifiants_invalides() from None

    utilisateur = await base[UTILISATEURS].find_one({"telephone": telephone})
    if utilisateur is None:
        bruler_temps_secret()
        verrou.noter_echec(identifiant)
        raise _identifiants_invalides()

    if not verifier_secret(demande.motDePasse, utilisateur.get("empreinte", "")):
        verrou.noter_echec(identifiant)
        raise _identifiants_invalides()

    if not utilisateur.get("actif", True):
        verrou.noter_echec(identifiant)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ce compte est désactivé.")

    verrou.noter_succes(identifiant)
    ecole = sans_mongo_id(await base[ECOLES].find_one({"id": utilisateur["ecoleId"]}))
    return {
        "jeton": _jeton_personnel(utilisateur, config),
        "utilisateur": {
            "id": utilisateur["id"],
            "nom": utilisateur.get("nom", ""),
            "telephone": utilisateur.get("telephone", ""),
            "role": utilisateur.get("role", ""),
            "actif": utilisateur.get("actif", True),
        },
        "ecole": {"id": ecole["id"], "nom": ecole.get("nom", "")} if ecole else None,
    }


@routeur.post("/portail")
async def connexion_portail(
    demande: DemandePortail,
    base: Any = Depends(db),
    config: Config = Depends(config_courante),
    verrou: VerrouConnexion = Depends(verrou_connexion),
) -> dict:
    """Échange le jeton du lien WhatsApp contre un jeton de session élève."""
    cle_verrou = f"portail:{demande.jeton[:12]}"
    attente = verrou.verifier(cle_verrou)
    if attente:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives. Réessayez dans {attente // 60 + 1} minute(s).",
        )

    eleve = await base[ELEVES].find_one({"portailJeton": demande.jeton})
    if eleve is None:
        verrou.noter_echec(cle_verrou)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Lien invalide ou expiré.")

    verrou.noter_succes(cle_verrou)
    jeton = creer_jeton(
        {
            "sub": eleve["id"],
            "ecoleId": eleve["ecoleId"],
            "cote": Cote.ELEVE.value,
            "nom": f"{eleve.get('prenoms', '')} {eleve.get('nom', '')}".strip(),
        },
        config.jwt_secret,
        duree=timedelta(days=config.portail_expire_days),
    )
    return {"jeton": jeton}


@routeur.get("/moi")
async def moi(session: Session = Depends(session_courante)) -> dict:
    """Qui suis-je, selon mon jeton."""
    return {
        "id": session.utilisateurId,
        "ecoleId": session.ecoleId,
        "cote": session.cote.value,
        "role": session.role.value if session.role else None,
        "nom": session.nom,
    }
