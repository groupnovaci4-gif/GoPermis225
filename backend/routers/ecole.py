"""Réglages de l'auto-école et journal d'audit."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.autorisation import Session, exiger_directeur, exiger_personnel, introuvable
from lib.db import ECOLES, JOURNAL, pour_mongo, sans_mongo_id
from lib.depot import champs_modifies, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from models.communs import maintenant
from models.ecole import EcoleMaj

routeur = APIRouter(prefix="/api/ecole", tags=["école"])


@routeur.get("")
async def mon_ecole(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_personnel(session)
    ecole = sans_mongo_id(await base[ECOLES].find_one({"id": session.ecoleId}))
    if ecole is None:
        raise introuvable("Auto-école")
    return ecole


@routeur.patch("")
async def modifier_ecole(
    maj: EcoleMaj,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Réglages : identité, tarifs, volumes horaires par défaut.

    Changer un tarif n'a d'effet que sur les inscriptions à venir : le montant
    dû est figé sur la fiche de chaque élève au moment de son inscription.
    """
    exiger_directeur(session)

    modifications = champs_modifies(maj)
    if not modifications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucune modification fournie.")
    modifications["modifieLe"] = maintenant()

    await base[ECOLES].update_one({"id": session.ecoleId}, {"$set": pour_mongo(modifications)})
    await journaliser(
        base, session, "ecole.reglages", cible_type="ecole", cible_id=session.ecoleId,
        details=", ".join(sorted(k for k in modifications if k != "modifieLe")),
    )
    return sans_mongo_id(await base[ECOLES].find_one({"id": session.ecoleId}))


@routeur.get("/journal")
async def journal(
    limite: int = Query(default=200, ge=1, le=1000),
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    """Journal d'audit — réservé au directeur."""
    exiger_directeur(session)
    entrees = await lister(
        base, JOURNAL, session, tri=[("creeLe", -1)], limite=limite
    )
    return entrees
