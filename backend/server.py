"""Point d'entrée de l'API Go Permis 225.

Lancer en développement :
    uvicorn server:app --reload

Le serveur refuse de démarrer si `JWT_SECRET` est absent ou trop court : mieux
vaut un échec bruyant au démarrage qu'une application signant ses jetons avec
un secret deviné.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from lib.config import ConfigurationInvalide, charger_config
from lib.db import configurer_db, creer_index, fabrique_motor, obtenir_db
from lib.deps import configurer_app
from routers import auth, ecole, eleves, paiements, personnel, portail, seances, tableau_bord, vehicules

logger = logging.getLogger("gopermis")


@asynccontextmanager
async def cycle_de_vie(app: FastAPI):
    try:
        await creer_index(obtenir_db())
    except Exception:  # noqa: BLE001 — l'API doit démarrer même si Mongo tarde
        logger.exception("Création des index impossible au démarrage.")
    yield


def creer_app(config=None) -> FastAPI:
    config = config or charger_config()
    configurer_app(config)

    app = FastAPI(
        title="Go Permis 225",
        description="Gestion des auto-écoles de Côte d'Ivoire.",
        version="1.0.0",
        lifespan=cycle_de_vie,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        # `False` volontairement : l'authentification passe par un en-tête
        # `Authorization`, pas par un cookie. Autoriser les identifiants
        # ouvrirait la porte au CSRF sans rien apporter.
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(ValueError)
    async def _valeur_invalide(_: Request, exc: ValueError) -> JSONResponse:
        # Les validateurs du domaine lèvent ValueError avec un message en
        # français destiné à l'utilisateur final.
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": str(exc)}
        )

    for module in (auth, eleves, paiements, seances, personnel, vehicules, tableau_bord, portail, ecole):
        app.include_router(module.routeur)

    @app.get("/api/sante", tags=["technique"])
    async def sante() -> dict:
        return {"statut": "ok", "service": "go-permis-225"}

    # L'interface construite, servie par le même serveur que l'API.
    #
    # Un seul port à exposer, une seule origine : plus de question de CORS, et
    # surtout l'application fonctionne derrière un proxy de chemin (un aperçu
    # d'hébergeur, un sous-dossier), car ses fichiers et ses appels d'API sont
    # tous résolus relativement à la page.
    #
    # Ce montage vient APRÈS les routeurs : FastAPI teste les routes dans
    # l'ordre d'ajout, donc « /api/… » est reconnu avant d'atteindre le
    # montage racine.
    interface = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if interface.is_dir():
        app.mount("/", StaticFiles(directory=interface, html=True), name="interface")
    else:
        logger.info(
            "Interface non construite (%s absent) : l'API seule est servie. "
            "Lancer `yarn build` dans frontend/ pour la générer.",
            interface,
        )

    return app


def _demarrer() -> FastAPI:
    try:
        config = charger_config()
    except ConfigurationInvalide as exc:
        raise SystemExit(f"Démarrage impossible : {exc}") from exc
    configurer_db(fabrique_motor(config))
    return creer_app(config)


def __getattr__(nom: str):
    """Construit l'application seulement quand `app` est demandé (PEP 562).

    `uvicorn server:app` déclenche la construction ; un test qui importe
    `creer_app` ne la déclenche pas et n'a donc pas besoin d'un vrai
    `JWT_SECRET` ni d'une base joignable.
    """
    if nom == "app":
        return _demarrer()
    raise AttributeError(f"module {__name__!r} n'a pas d'attribut {nom!r}")
