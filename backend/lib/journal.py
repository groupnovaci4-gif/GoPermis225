"""Écriture du journal d'audit.

L'acteur et l'horodatage sont posés par le serveur à partir de la session.
Ne jamais les accepter depuis le client : un journal falsifiable ne sert à
rien le jour où il faut savoir qui a encaissé quoi.
"""
from __future__ import annotations

from typing import Any

from models.communs import maintenant, nouvel_id

from .autorisation import Session
from .db import JOURNAL


async def journaliser(
    db: Any,
    session: Session,
    action: str,
    *,
    cible_type: str = "",
    cible_id: str = "",
    details: str = "",
) -> None:
    await db[JOURNAL].insert_one(
        {
            "id": nouvel_id(),
            "ecoleId": session.ecoleId,
            "acteurId": session.utilisateurId,
            "acteurNom": session.nom,
            "action": action,
            "cibleType": cible_type,
            "cibleId": cible_id,
            "details": details[:2000],
            "creeLe": maintenant(),
            "modifieLe": maintenant(),
        }
    )
