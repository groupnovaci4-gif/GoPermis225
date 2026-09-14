"""Helpers de requête cloisonnés par auto-école.

Toute lecture et toute écriture passent par un filtre contenant `ecoleId`,
issu du jeton. C'est répétitif à écrire à la main et un oubli ne se voit pas :
d'où ces helpers, qui rendent l'oubli impossible.
"""
from __future__ import annotations

from typing import Any

from .autorisation import Session, introuvable
from .db import sans_mongo_id


def filtre(session: Session, **extra: Any) -> dict[str, Any]:
    """Filtre Mongo toujours borné à l'auto-école de l'appelant."""
    base = {"ecoleId": session.ecoleId}
    base.update({k: v for k, v in extra.items() if v is not None})
    return base


async def lire_un(db: Any, collection: str, session: Session, doc_id: str, quoi: str) -> dict:
    """Lit un document de SA propre école, ou lève 404.

    Un document appartenant à une autre auto-école donne « introuvable », pas
    « interdit » : répondre 403 confirmerait son existence.
    """
    doc = sans_mongo_id(await db[collection].find_one(filtre(session, id=doc_id)))
    if doc is None:
        raise introuvable(quoi)
    return doc


async def lister(
    db: Any,
    collection: str,
    session: Session,
    *,
    tri: list[tuple[str, int]] | None = None,
    limite: int = 500,
    **extra: Any,
) -> list[dict]:
    curseur = db[collection].find(filtre(session, **extra))
    if tri:
        curseur = curseur.sort(tri)
    documents = await curseur.to_list(length=limite)
    return [sans_mongo_id(d) for d in documents]


def champs_modifies(maj: Any) -> dict[str, Any]:
    """Ne garde que les champs réellement fournis.

    `exclude_unset` est essentiel : sans lui, un champ absent de la requête
    arriverait à `None` et effacerait la valeur enregistrée.
    """
    return maj.model_dump(exclude_unset=True, exclude_none=True)
