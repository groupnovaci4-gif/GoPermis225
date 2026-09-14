"""Parc automobile : fiches véhicules, échéances, entretien."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.autorisation import Session, exiger_gestion, exiger_personnel
from lib.db import VEHICULES, pour_mongo
from lib.depot import champs_modifies, filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.metier import alertes_vehicule
from models.communs import maintenant
from models.parc import Entretien, Vehicule, VehiculeCreation, VehiculeMaj

routeur = APIRouter(prefix="/api/vehicules", tags=["parc auto"])


@routeur.get("")
async def lister_vehicules(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_personnel(session)
    vehicules = await lister(base, VEHICULES, session, tri=[("immatriculation", 1)], limite=500)
    for v in vehicules:
        v["alertes"] = alertes_vehicule(v)
    return vehicules


@routeur.post("", status_code=status.HTTP_201_CREATED)
async def creer_vehicule(
    entree: VehiculeCreation,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_gestion(session)

    immat = entree.immatriculation.upper().replace(" ", "")
    if await base[VEHICULES].find_one(filtre(session, immatriculation=immat)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ce véhicule est déjà enregistré."
        )

    vehicule = Vehicule(
        ecoleId=session.ecoleId,
        immatriculation=immat,
        modele=entree.modele,
        annee=entree.annee,
        categorie=entree.categorie,
        kilometrage=entree.kilometrage,
        assuranceExpire=entree.assuranceExpire,
        visiteTechniqueExpire=entree.visiteTechniqueExpire,
        vignetteExpire=entree.vignetteExpire,
    )
    await base[VEHICULES].insert_one(pour_mongo(vehicule.model_dump()))
    await journaliser(
        base, session, "vehicule.cree", cible_type="vehicule", cible_id=vehicule.id,
        details=f"{vehicule.immatriculation} — {vehicule.modele}",
    )
    return vehicule.model_dump()


@routeur.patch("/{vehicule_id}")
async def modifier_vehicule(
    vehicule_id: str,
    maj: VehiculeMaj,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_gestion(session)
    await lire_un(base, VEHICULES, session, vehicule_id, "Véhicule")

    modifications = champs_modifies(maj)
    if not modifications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucune modification fournie.")
    if "immatriculation" in modifications:
        modifications["immatriculation"] = modifications["immatriculation"].upper().replace(" ", "")

    modifications["modifieLe"] = maintenant()
    await base[VEHICULES].update_one(filtre(session, id=vehicule_id), {"$set": pour_mongo(modifications)})
    await journaliser(
        base, session, "vehicule.modifie", cible_type="vehicule", cible_id=vehicule_id
    )
    return await lire_un(base, VEHICULES, session, vehicule_id, "Véhicule")


@routeur.post("/{vehicule_id}/entretien", status_code=status.HTTP_201_CREATED)
async def ajouter_entretien(
    vehicule_id: str,
    entretien: Entretien,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Ajoute une ligne au journal d'entretien. Les lignes s'empilent, on ne
    réécrit jamais l'historique d'un véhicule."""
    exiger_gestion(session)
    await lire_un(base, VEHICULES, session, vehicule_id, "Véhicule")

    mise_a_jour: dict[str, Any] = {"modifieLe": maintenant()}
    if entretien.kilometrage:
        mise_a_jour["kilometrage"] = entretien.kilometrage

    await base[VEHICULES].update_one(
        filtre(session, id=vehicule_id),
        {"$push": {"entretiens": pour_mongo(entretien.model_dump())},
         "$set": pour_mongo(mise_a_jour)},
    )
    await journaliser(
        base, session, "vehicule.entretien", cible_type="vehicule", cible_id=vehicule_id,
        details=f"{entretien.nature} — {entretien.cout} FCFA",
    )
    return await lire_un(base, VEHICULES, session, vehicule_id, "Véhicule")
