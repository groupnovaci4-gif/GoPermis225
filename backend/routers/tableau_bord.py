"""Tableau de bord du directeur."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends

from lib.autorisation import Session, exiger_directeur, exiger_gestion
from lib.db import DEPENSES, ELEVES, PAIEMENTS, SEANCES, UTILISATEURS, VEHICULES
from lib.depot import lister
from lib.deps import db, session_courante
from lib.metier import (
    alertes_vehicule,
    kpis_ecole,
    progression_eleve,
    revenus_par_mois,
    salaire_moniteur,
)
from models.communs import Role, StatutEleve

routeur = APIRouter(prefix="/api/tableau-bord", tags=["tableau de bord"])


@routeur.get("")
async def tableau_bord(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Vue consolidée de l'auto-école.

    Réservée au directeur : elle expose le chiffre d'affaires, les dépenses et
    la performance individuelle des moniteurs.
    """
    exiger_directeur(session)

    eleves = await lister(base, ELEVES, session, limite=5000)
    paiements = await lister(base, PAIEMENTS, session, limite=20000)
    depenses = await lister(base, DEPENSES, session, limite=5000)
    seances = await lister(base, SEANCES, session, limite=20000)
    vehicules = await lister(base, VEHICULES, session, limite=200)
    agents = await lister(base, UTILISATEURS, session, limite=200)

    # Élèves prêts à passer l'examen : leurs heures sont faites.
    seances_par_eleve: dict[str, list[dict]] = {}
    for s in seances:
        seances_par_eleve.setdefault(s.get("eleveId", ""), []).append(s)

    prets = []
    for e in eleves:
        if e.get("statut") != StatutEleve.ACTIF.value:
            continue
        progression = progression_eleve(
            seances_par_eleve.get(e["id"], []),
            code_prevues=int(e.get("heuresCodePrevues", 0)),
            conduite_prevues=int(e.get("heuresConduitePrevues", 0)),
        )
        if progression.pretPourExamen:
            prets.append(
                {
                    "eleveId": e["id"],
                    "matricule": e.get("matricule", ""),
                    "nom": e.get("nom", ""),
                    "prenoms": e.get("prenoms", ""),
                    **progression.as_dict(),
                }
            )

    # Performance par moniteur : taux de réussite de ses élèves.
    moniteurs = [a for a in agents if a.get("role") == Role.MONITEUR.value]
    perf = []
    for m in moniteurs:
        ses_eleves = {
            s.get("eleveId") for s in seances if s.get("moniteurId") == m["id"]
        }
        formes = [e for e in eleves if e["id"] in ses_eleves]
        diplomes = len([e for e in formes if e.get("statut") == StatutEleve.DIPLOME.value])
        recales = len([e for e in formes if e.get("statut") == StatutEleve.RECALE.value])
        termines = diplomes + recales
        perf.append(
            {
                "moniteurId": m["id"],
                "nom": m.get("nom", ""),
                "elevesFormes": len(formes),
                "diplomes": diplomes,
                "tauxReussite": 0 if termines == 0 else round(diplomes * 100 / termines),
                **salaire_moniteur(seances, m["id"], int(m.get("tarifHoraire", 0))),
            }
        )

    alertes = []
    for v in vehicules:
        for a in alertes_vehicule(v):
            alertes.append({"vehiculeId": v["id"], "immatriculation": v.get("immatriculation", ""), **a})

    return {
        "kpis": kpis_ecole(
            eleves=eleves, paiements=paiements, depenses=depenses, seances=seances
        ),
        "revenusParMois": revenus_par_mois(paiements),
        "elevesPretsExamen": prets,
        "performanceMoniteurs": sorted(perf, key=lambda p: p["tauxReussite"], reverse=True),
        "alertesVehicules": alertes,
    }


@routeur.get("/aujourdhui")
async def resume_du_jour(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Résumé léger pour l'accueil du secrétariat."""
    exiger_gestion(session)

    eleves = await lister(base, ELEVES, session, limite=5000)
    paiements = await lister(base, PAIEMENTS, session, limite=20000)
    seances = await lister(base, SEANCES, session, limite=5000)

    aujourdhui = date.today()
    kpis = kpis_ecole(eleves=eleves, paiements=paiements, depenses=[], seances=seances)
    return {
        "date": aujourdhui.isoformat(),
        "elevesActifs": kpis["elevesActifs"],
        "encaisseJour": kpis["encaisseJour"],
        "seancesJour": kpis["seancesJour"],
        "resteARecouvrer": kpis["resteARecouvrer"],
    }
