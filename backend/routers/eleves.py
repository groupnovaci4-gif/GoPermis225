"""Gestion des élèves : dossier, statuts, progression, lien portail."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.autorisation import Session, exiger_gestion, exiger_personnel, introuvable
from lib.db import ECOLES, ELEVES, PAIEMENTS, SEANCES, pour_mongo, prochaine_sequence
from lib.depot import champs_modifies, filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.metier import progression_eleve, solde_eleve
from lib.securite import jeton_opaque
from models.communs import Role, StatutEleve, maintenant
from models.eleve import (
    ChangementStatutEntree,
    Eleve,
    EleveCreation,
    EleveMaj,
)

routeur = APIRouter(prefix="/api/eleves", tags=["élèves"])


async def _matricule(base: Any, ecole_id: str) -> str:
    """Matricule lisible et unique dans l'école : `GP-2026-0042`."""
    suite = await prochaine_sequence(base, ecole_id, "eleve")
    return f"GP-{date.today().year}-{suite:04d}"


async def _visible_par(base: Any, session: Session, eleve_id: str) -> dict:
    """Lit un élève en appliquant la restriction du rôle moniteur.

    Un moniteur ne voit que les élèves avec qui il a une séance : sans cette
    règle, un moniteur aurait accès à tout le fichier clients de l'école.
    """
    eleve = await lire_un(base, ELEVES, session, eleve_id, "Élève")
    if session.role is Role.MONITEUR:
        lien = await base[SEANCES].find_one(
            filtre(session, eleveId=eleve_id, moniteurId=session.utilisateurId)
        )
        if lien is None:
            raise introuvable("Élève")
    return eleve


@routeur.get("")
async def lister_eleves(
    statut: StatutEleve | None = None,
    recherche: str = Query(default="", max_length=80),
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_personnel(session)

    if session.role is Role.MONITEUR:
        # On part de ses séances pour ne remonter que ses élèves.
        seances = await lister(base, SEANCES, session, moniteurId=session.utilisateurId, limite=2000)
        ids = {s.get("eleveId") for s in seances if s.get("eleveId")}
        if not ids:
            return []
        curseur = base[ELEVES].find(filtre(session, **{"id": {"$in": list(ids)}}))
        eleves = [d for d in await curseur.to_list(length=1000)]
        for d in eleves:
            d.pop("_id", None)
    else:
        eleves = await lister(
            base, ELEVES, session, tri=[("nom", 1)], limite=2000,
            **({"statut": statut.value} if statut else {}),
        )

    besoin = recherche.strip().lower()
    if besoin:
        eleves = [
            e
            for e in eleves
            if besoin in f"{e.get('nom','')} {e.get('prenoms','')} {e.get('matricule','')} {e.get('telephone','')}".lower()
        ]

    # Progression et solde joints à la liste : sans cela, l'écran devrait
    # appeler l'API une fois par élève pour afficher deux colonnes.
    ids = {e["id"] for e in eleves}
    seances_par_eleve: dict[str, list[dict]] = {}
    for s in await lister(base, SEANCES, session, limite=20000):
        if s.get("eleveId") in ids:
            seances_par_eleve.setdefault(s["eleveId"], []).append(s)

    paiements_par_eleve: dict[str, list[dict]] = {}
    for p in await lister(base, PAIEMENTS, session, limite=20000):
        if p.get("eleveId") in ids:
            paiements_par_eleve.setdefault(p["eleveId"], []).append(p)

    for e in eleves:
        # Le jeton du portail ne sort jamais dans une liste : il vaut mot de passe.
        e.pop("portailJeton", None)
        e["progression"] = progression_eleve(
            seances_par_eleve.get(e["id"], []),
            code_prevues=int(e.get("heuresCodePrevues", 0)),
            conduite_prevues=int(e.get("heuresConduitePrevues", 0)),
        ).as_dict()
        e["solde"] = solde_eleve(
            int(e.get("montantTotal", 0)), paiements_par_eleve.get(e["id"], []),
        ).as_dict()

    return eleves


@routeur.post("", status_code=status.HTTP_201_CREATED)
async def creer_eleve(
    entree: EleveCreation,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_gestion(session)

    ecole = await base[ECOLES].find_one({"id": session.ecoleId}) or {}
    tarifs = ecole.get("tarifParCategorie") or {}
    montant = entree.montantTotal or int(tarifs.get(entree.categorie.value, 0))

    eleve = Eleve(
        ecoleId=session.ecoleId,
        matricule=await _matricule(base, session.ecoleId),
        nom=entree.nom,
        prenoms=entree.prenoms,
        telephone=entree.telephone,
        telephoneTuteur=entree.telephoneTuteur,
        cni=entree.cni,
        dateNaissance=entree.dateNaissance,
        commune=entree.commune,
        photoUrl=entree.photoUrl,
        categorie=entree.categorie,
        montantTotal=montant,
        heuresCodePrevues=entree.heuresCodePrevues
        if entree.heuresCodePrevues is not None
        else int(ecole.get("heuresCodeParDefaut", 20)),
        heuresConduitePrevues=entree.heuresConduitePrevues
        if entree.heuresConduitePrevues is not None
        else int(ecole.get("heuresConduiteParDefaut", 20)),
        portailJeton=jeton_opaque(),
    )
    doc = eleve.model_dump()
    doc["portailJeton"] = eleve.portailJeton
    await base[ELEVES].insert_one(pour_mongo(doc))
    await journaliser(
        base, session, "eleve.cree", cible_type="eleve", cible_id=eleve.id,
        details=f"{eleve.prenoms} {eleve.nom} — {eleve.matricule}",
    )

    sortie = eleve.model_dump()
    sortie["portailJeton"] = eleve.portailJeton  # une seule fois, à la création
    return sortie


@routeur.get("/{eleve_id}")
async def detail_eleve(
    eleve_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_personnel(session)
    eleve = await _visible_par(base, session, eleve_id)

    paiements = await lister(base, PAIEMENTS, session, eleveId=eleve_id, limite=1000)
    seances = await lister(base, SEANCES, session, eleveId=eleve_id, limite=1000)

    eleve.pop("portailJeton", None)
    return {
        "eleve": eleve,
        "solde": solde_eleve(int(eleve.get("montantTotal", 0)), paiements).as_dict(),
        "progression": progression_eleve(
            seances,
            code_prevues=int(eleve.get("heuresCodePrevues", 0)),
            conduite_prevues=int(eleve.get("heuresConduitePrevues", 0)),
        ).as_dict(),
        "paiements": sorted(paiements, key=lambda p: str(p.get("date", "")), reverse=True),
        "seances": sorted(seances, key=lambda s: s.get("debut") or maintenant(), reverse=True),
    }


@routeur.patch("/{eleve_id}")
async def modifier_eleve(
    eleve_id: str,
    maj: EleveMaj,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_gestion(session)
    await lire_un(base, ELEVES, session, eleve_id, "Élève")

    modifications = champs_modifies(maj)
    if not modifications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucune modification fournie.")
    modifications["modifieLe"] = maintenant()

    await base[ELEVES].update_one(filtre(session, id=eleve_id), {"$set": pour_mongo(modifications)})
    await journaliser(
        base, session, "eleve.modifie", cible_type="eleve", cible_id=eleve_id,
        details=", ".join(sorted(k for k in modifications if k != "modifieLe")),
    )
    return await lire_un(base, ELEVES, session, eleve_id, "Élève")


@routeur.post("/{eleve_id}/statut")
async def changer_statut(
    eleve_id: str,
    entree: ChangementStatutEntree,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Change le statut et empile une ligne d'historique — jamais d'écrasement."""
    exiger_gestion(session)
    eleve = await lire_un(base, ELEVES, session, eleve_id, "Élève")

    if eleve.get("statut") == entree.statut.value:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "L'élève est déjà dans ce statut."
        )

    ligne = {
        "statut": entree.statut.value,
        "motif": entree.motif,
        "horodatage": maintenant().isoformat(),
        "parUtilisateurId": session.utilisateurId,
    }
    await base[ELEVES].update_one(
        filtre(session, id=eleve_id),
        {
            "$set": {"statut": entree.statut.value, "modifieLe": maintenant()},
            "$push": {"historiqueStatuts": ligne},
        },
    )
    await journaliser(
        base, session, "eleve.statut", cible_type="eleve", cible_id=eleve_id,
        details=f"{eleve.get('statut')} → {entree.statut.value} ({entree.motif or 'sans motif'})",
    )
    return await lire_un(base, ELEVES, session, eleve_id, "Élève")


@routeur.post("/{eleve_id}/lien-portail")
async def regenerer_lien_portail(
    eleve_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Régénère le jeton du lien élève. L'ancien lien cesse immédiatement."""
    exiger_gestion(session)
    await lire_un(base, ELEVES, session, eleve_id, "Élève")

    jeton = jeton_opaque()
    await base[ELEVES].update_one(
        filtre(session, id=eleve_id),
        {"$set": {"portailJeton": jeton, "modifieLe": maintenant()}},
    )
    await journaliser(
        base, session, "eleve.lien_portail", cible_type="eleve", cible_id=eleve_id
    )
    return {"portailJeton": jeton}
