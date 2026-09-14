"""Configuration du serveur, lue une seule fois au démarrage.

Principe : échouer bruyamment au démarrage plutôt que silencieusement en
production. Un secret manquant empêche le serveur de se lancer.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class ConfigurationInvalide(RuntimeError):
    """Levée quand une variable d'environnement obligatoire manque."""


def _obligatoire(nom: str) -> str:
    valeur = os.environ.get(nom, "").strip()
    if not valeur:
        raise ConfigurationInvalide(
            f"Variable d'environnement obligatoire manquante : {nom}. "
            "Voir backend/.env.example."
        )
    return valeur


def _entier(nom: str, defaut: int) -> int:
    brut = os.environ.get(nom, "").strip()
    if not brut:
        return defaut
    try:
        return int(brut)
    except ValueError as exc:
        raise ConfigurationInvalide(f"{nom} doit être un entier, reçu : {brut!r}") from exc


@dataclass(frozen=True)
class Config:
    mongo_url: str
    db_name: str
    jwt_secret: str
    jwt_expire_minutes: int
    cors_origins: list[str] = field(default_factory=list)
    login_max_fails: int = 5
    login_lock_seconds: int = 900

    # Durée de vie du jeton du portail élève (jours). Plus long car l'élève
    # reçoit un lien unique par WhatsApp et ne se reconnecte pas.
    portail_expire_days: int = 180


def charger_config() -> Config:
    secret = _obligatoire("JWT_SECRET")
    if len(secret) < 32:
        raise ConfigurationInvalide(
            "JWT_SECRET doit faire au moins 32 caractères. "
            'Générer avec : python3 -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    origines = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    return Config(
        mongo_url=os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
        db_name=os.environ.get("DB_NAME", "gopermis225"),
        jwt_secret=secret,
        jwt_expire_minutes=_entier("JWT_EXPIRE_MINUTES", 720),
        cors_origins=origines,
        login_max_fails=_entier("LOGIN_MAX_FAILS", 5),
        login_lock_seconds=_entier("LOGIN_LOCK_SECONDS", 900),
    )
