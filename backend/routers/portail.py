"""Portail élève : lecture seule, strictement limitée à ses propres données.

Un jeton élève ne doit jamais permettre de lire autre chose que le dossier de
l'élève concerné — ni les autres élèves, ni les dépenses, ni les coordonnées
du personnel au-delà du prénom du moniteur de ses séances.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from lib.autorisation import Session, interdit, introuvable
from lib.db import ECOLES, ELEVES, PAIEMENTS, SEANCES, UTILISATEURS, VEHICULES, sans_mongo_id
from lib.depot import filtre, lister
from lib.deps import db, session_courante
from lib.metier import progression_eleve, solde_eleve
from models.communs import Cote

routeur = APIRouter(prefix="/api/portail", tags=["portail élève"])


def _exiger_eleve(session: Session) -> Session:
    if session.cote is not Cote.ELEVE:
        raise interdit("Ce point d'entrée est réservé au portail élève.")
    return session


@routeur.get("")
async def mon_dossier(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    _exiger_eleve(session)

    eleve = sans_mongo_id(
        await base[ELEVES].find_one(filtre(session, id=session.utilisateurId))
    )
    if eleve is None:
        raise introuvable("Dossier")

    paiements = await lister(base, PAIEMENTS, session, eleveId=eleve["id"], limite=500)
    seances = await lister(base, SEANCES, session, eleveId=eleve["id"], limite=1000)
    ecole = sans_mongo_id(await base[ECOLES].find_one({"id": session.ecoleId})) or {}

    # Annuaire réduit : le prénom du moniteur suffit à l'élève. Son numéro de
    # téléphone, son salaire et son contrat ne le regardent pas.
    ids_moniteurs = {s.get("moniteurId") for s in seances if s.get("moniteurId")}
    moniteurs = {}
    if ids_moniteurs:
        curseur = base[UTILISATEURS].find(filtre(session, **{"id": {"$in": list(ids_moniteurs)}}))
        for m in await curseur.to_list(length=100):
            moniteurs[m["id"]] = m.get("nom", "")

    vehicules = {}
    ids_vehicules = {s.get("vehiculeId") for s in seances if s.get("vehiculeId")}
    if ids_vehicules:
        curseur = base[VEHICULES].find(filtre(session, **{"id": {"$in": list(ids_vehicules)}}))
        for v in await curseur.to_list(length=100):
            vehicules[v["id"]] = v.get("modele", "")

    return {
        "ecole": {"nom": ecole.get("nom", ""), "telephone": ecole.get("telephone", ""),
                  "commune": ecole.get("commune", ""), "logoUrl": ecole.get("logoUrl", "")},
        "eleve": {
            "id": eleve["id"],
            "matricule": eleve.get("matricule", ""),
            "nom": eleve.get("nom", ""),
            "prenoms": eleve.get("prenoms", ""),
            "categorie": eleve.get("categorie", ""),
            "statut": eleve.get("statut", ""),
            "photoUrl": eleve.get("photoUrl", ""),
            "resultatCode": eleve.get("resultatCode", ""),
            "resultatConduite": eleve.get("resultatConduite", ""),
            "datePermis": eleve.get("datePermis"),
        },
        "solde": solde_eleve(int(eleve.get("montantTotal", 0)), paiements).as_dict(),
        "progression": progression_eleve(
            seances,
            code_prevues=int(eleve.get("heuresCodePrevues", 0)),
            conduite_prevues=int(eleve.get("heuresConduitePrevues", 0)),
        ).as_dict(),
        "paiements": [
            {
                "date": p.get("date"),
                "montant": p.get("montant", 0),
                "moyen": p.get("moyen", ""),
                "numeroRecu": p.get("numeroRecu", ""),
            }
            for p in sorted(paiements, key=lambda p: str(p.get("date", "")), reverse=True)
        ],
        "seances": [
            {
                "id": s.get("id"),
                "type": s.get("type", ""),
                "debut": s.get("debut"),
                "fin": s.get("fin"),
                "statut": s.get("statut", ""),
                "lieu": s.get("lieu", ""),
                "moniteur": moniteurs.get(s.get("moniteurId", ""), ""),
                "vehicule": vehicules.get(s.get("vehiculeId", ""), ""),
            }
            for s in sorted(seances, key=lambda s: str(s.get("debut", "")))
        ],
    }
