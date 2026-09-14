"""Dépendances FastAPI : configuration, base, session authentifiée."""
from __future__ import annotations

from typing import Any

from fastapi import Depends, Header, HTTPException, status

from models.communs import Cote, Role

from .autorisation import Session
from .config import Config, charger_config
from .db import obtenir_db
from .securite import JetonInvalide, VerrouConnexion, lire_jeton

_config: Config | None = None
_verrou: VerrouConnexion | None = None


def configurer_app(config: Config) -> None:
    global _config, _verrou
    _config = config
    _verrou = VerrouConnexion(
        max_echecs=config.login_max_fails, duree_blocage=config.login_lock_seconds
    )


def config_courante() -> Config:
    if _config is None:
        raise RuntimeError("Configuration non initialisée : appeler configurer_app().")
    return _config


def verrou_connexion() -> VerrouConnexion:
    if _verrou is None:
        raise RuntimeError("Verrou non initialisé : appeler configurer_app().")
    return _verrou


def db() -> Any:
    return obtenir_db()


def _non_authentifie(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def session_courante(
    authorization: str = Header(default=""),
    config: Config = Depends(config_courante),
) -> Session:
    """Reconstruit l'identité de l'appelant depuis le jeton `Bearer`.

    Tout ce qui suit — y compris l'`ecoleId` — vient du jeton signé, jamais
    d'un paramètre de requête. C'est ce qui rend le cloisonnement entre
    auto-écoles impossible à contourner depuis le client.
    """
    schema, _, brut = authorization.partition(" ")
    if schema.lower() != "bearer" or not brut.strip():
        raise _non_authentifie("Jeton d'authentification absent.")

    try:
        charge = lire_jeton(brut.strip(), config.jwt_secret)
    except JetonInvalide as exc:
        raise _non_authentifie(str(exc)) from exc

    sujet = charge.get("sub")
    ecole_id = charge.get("ecoleId")
    brut_cote = charge.get("cote")
    if not sujet or not ecole_id or brut_cote not in (Cote.ECOLE.value, Cote.ELEVE.value):
        raise _non_authentifie("Jeton incomplet.")

    cote = Cote(brut_cote)
    role: Role | None = None
    if cote is Cote.ECOLE:
        try:
            role = Role(charge.get("role"))
        except ValueError as exc:
            raise _non_authentifie("Rôle inconnu dans le jeton.") from exc

    return Session(
        utilisateurId=str(sujet),
        ecoleId=str(ecole_id),
        cote=cote,
        role=role,
        nom=str(charge.get("nom", "")),
    )
