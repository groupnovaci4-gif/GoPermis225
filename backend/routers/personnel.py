"""Personnel : moniteurs et secrétaires. Réservé au directeur."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.autorisation import Session, exiger_directeur, exiger_personnel
from lib.db import ELEVES, SEANCES, UTILISATEURS, pour_mongo
from lib.depot import champs_modifies, filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.metier import salaire_moniteur
from lib.securite import hacher_secret
from models.communs import Role, StatutEleve, maintenant, normaliser_telephone
from models.ecole import Utilisateur, UtilisateurCreation, UtilisateurMaj

routeur = APIRouter(prefix="/api/personnel", tags=["personnel"])


def _sans_empreinte(doc: dict) -> dict:
    """L'empreinte du mot de passe ne quitte jamais le serveur."""
    doc.pop("empreinte", None)
    return doc


@routeur.get("")
async def lister_personnel(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    """Annuaire du personnel.

    Accessible à tout le personnel — un moniteur doit pouvoir savoir qui est
    le secrétaire — mais réduit aux champs utiles : ni salaire, ni empreinte.
    """
    exiger_personnel(session)
    agents = await lister(base, UTILISATEURS, session, tri=[("nom", 1)], limite=500)

    if session.role is Role.DIRECTEUR:
        return [_sans_empreinte(a) for a in agents]

    return [
        {
            "id": a["id"],
            "nom": a.get("nom", ""),
            "role": a.get("role", ""),
            "telephone": a.get("telephone", ""),
            "actif": a.get("actif", True),
        }
        for a in agents
    ]


@routeur.post("", status_code=status.HTTP_201_CREATED)
async def creer_agent(
    entree: UtilisateurCreation,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_directeur(session)

    telephone = normaliser_telephone(entree.telephone)
    if await base[UTILISATEURS].find_one({"telephone": telephone}):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ce numéro est déjà associé à un compte."
        )

    agent = Utilisateur(
        ecoleId=session.ecoleId,
        nom=entree.nom,
        telephone=telephone,
        role=entree.role,
        tarifHoraire=entree.tarifHoraire,
        permisEnseigner=entree.permisEnseigner,
        empreinte=hacher_secret(entree.motDePasse),
    )
    doc = agent.model_dump()
    doc["empreinte"] = agent.empreinte
    await base[UTILISATEURS].insert_one(pour_mongo(doc))
    await journaliser(
        base, session, "personnel.cree", cible_type="utilisateur", cible_id=agent.id,
        details=f"{agent.nom} — {agent.role.value}",
    )
    return _sans_empreinte(agent.model_dump())


@routeur.patch("/{agent_id}")
async def modifier_agent(
    agent_id: str,
    maj: UtilisateurMaj,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_directeur(session)
    agent = await lire_un(base, UTILISATEURS, session, agent_id, "Collaborateur")

    modifications = champs_modifies(maj)
    if not modifications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucune modification fournie.")

    # Un directeur ne peut pas se désactiver lui-même : l'école se retrouverait
    # sans personne pour réactiver quoi que ce soit.
    if agent_id == session.utilisateurId:
        if modifications.get("actif") is False:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Vous ne pouvez pas désactiver votre propre compte."
            )
        if modifications.get("role") and modifications["role"] != Role.DIRECTEUR.value:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Vous ne pouvez pas retirer votre propre rôle de directeur."
            )

    modifications["modifieLe"] = maintenant()
    await base[UTILISATEURS].update_one(filtre(session, id=agent_id), {"$set": pour_mongo(modifications)})
    await journaliser(
        base, session, "personnel.modifie", cible_type="utilisateur", cible_id=agent_id,
        details=", ".join(sorted(k for k in modifications if k != "modifieLe")),
    )
    return _sans_empreinte(await lire_un(base, UTILISATEURS, session, agent_id, "Collaborateur"))


@routeur.post("/{agent_id}/mot-de-passe")
async def reinitialiser_mot_de_passe(
    agent_id: str,
    corps: dict,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_directeur(session)
    await lire_un(base, UTILISATEURS, session, agent_id, "Collaborateur")

    nouveau = str(corps.get("motDePasse", ""))
    if len(nouveau) < 8:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Le mot de passe doit faire au moins 8 caractères.",
        )

    await base[UTILISATEURS].update_one(
        filtre(session, id=agent_id),
        {"$set": {"empreinte": hacher_secret(nouveau), "modifieLe": maintenant()}},
    )
    await journaliser(
        base, session, "personnel.mot_de_passe", cible_type="utilisateur", cible_id=agent_id
    )
    return {"reinitialise": agent_id}


@routeur.get("/paie")
async def paie_du_mois(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    """Heures et rémunération de chaque moniteur, sur la semaine et le mois.

    Un point d'entrée dédié plutôt que le tableau de bord complet : la page
    Moniteurs n'a pas besoin des recettes ni des créances de l'école.
    """
    exiger_directeur(session)

    agents = await lister(base, UTILISATEURS, session, limite=200)
    seances = await lister(base, SEANCES, session, limite=20000)
    eleves = await lister(base, ELEVES, session, limite=5000)

    aujourdhui = date.today()
    debut_semaine = aujourdhui - timedelta(days=aujourdhui.weekday())

    def _jour(valeur) -> date | None:
        if isinstance(valeur, datetime):
            return valeur.date()
        return valeur if isinstance(valeur, date) else None

    de_la_semaine = [s for s in seances if (j := _jour(s.get("debut"))) and j >= debut_semaine]
    du_mois = [
        s for s in seances
        if (j := _jour(s.get("debut")))
        and (j.year, j.month) == (aujourdhui.year, aujourdhui.month)
    ]

    lignes = []
    for a in agents:
        if a.get("role") != Role.MONITEUR.value:
            continue
        tarif = int(a.get("tarifHoraire", 0))
        ses_eleves = {s.get("eleveId") for s in seances if s.get("moniteurId") == a["id"]}
        formes = [e for e in eleves if e["id"] in ses_eleves]
        diplomes = len([e for e in formes if e.get("statut") == StatutEleve.DIPLOME.value])
        recales = len([e for e in formes if e.get("statut") == StatutEleve.RECALE.value])
        termines = diplomes + recales

        mois = salaire_moniteur(du_mois, a["id"], tarif)
        lignes.append(
            {
                "moniteurId": a["id"],
                "nom": a.get("nom", ""),
                "telephone": a.get("telephone", ""),
                "actif": a.get("actif", True),
                "permisEnseigner": a.get("permisEnseigner", ""),
                "tarifHoraire": tarif,
                "heuresSemaine": salaire_moniteur(de_la_semaine, a["id"], tarif)["heures"],
                "heuresMois": mois["heures"],
                "paieMois": mois["montant"],
                "elevesSuivis": len(ses_eleves),
                "tauxReussite": 0 if termines == 0 else round(diplomes * 100 / termines),
            }
        )
    return sorted(lignes, key=lambda l: l["nom"])


@routeur.get("/{agent_id}/salaire")
async def salaire(
    agent_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Heures effectuées et rémunération correspondante.

    Le directeur consulte n'importe quel moniteur ; un moniteur ne consulte
    que sa propre fiche.
    """
    exiger_personnel(session)
    if session.role is not Role.DIRECTEUR and session.utilisateurId != agent_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Vous ne pouvez consulter que votre propre fiche."
        )

    agent = await lire_un(base, UTILISATEURS, session, agent_id, "Collaborateur")
    seances = await lister(base, SEANCES, session, moniteurId=agent_id, limite=5000)
    return {
        "moniteur": {"id": agent["id"], "nom": agent.get("nom", "")},
        **salaire_moniteur(seances, agent_id, int(agent.get("tarifHoraire", 0))),
    }
