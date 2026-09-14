"""Fixtures de test.

Tout tourne en processus : MongoDB est simulée par `mongomock_motor`, l'API
est appelée via le transport ASGI de httpx. Aucun serveur, aucun réseau, donc
aucun test qui « passe sur ma machine » et échoue en intégration continue.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))

from lib.config import Config  # noqa: E402
from lib.db import configurer_db  # noqa: E402
from server import creer_app  # noqa: E402

CONFIG_TEST = Config(
    mongo_url="mongomock://local",
    db_name="test_gopermis",
    jwt_secret="secret-de-test-suffisamment-long-pour-passer-la-validation",
    jwt_expire_minutes=60,
    cors_origins=["http://localhost:5173"],
    login_max_fails=3,
    login_lock_seconds=900,
)


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    base = AsyncMongoMockClient()["test_gopermis"]
    configurer_db(lambda: base)
    app = creer_app(CONFIG_TEST)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def inscrire(client: AsyncClient, *, nom="Auto-École Ivoire", tel="0701020304",
                   directeur="M. Koffi", mdp="motdepasse123") -> dict:
    """Crée une auto-école et renvoie son jeton directeur."""
    reponse = await client.post(
        "/api/auth/inscription",
        json={
            "nomEcole": nom,
            "commune": "Abidjan",
            "nomDirecteur": directeur,
            "telephone": tel,
            "motDePasse": mdp,
        },
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


def entete(jeton: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {jeton}"}


async def creer_agent(client: AsyncClient, jeton_directeur: str, *, role: str,
                      nom: str, tel: str, mdp="motdepasse123", tarif=0) -> dict:
    reponse = await client.post(
        "/api/personnel",
        headers=entete(jeton_directeur),
        json={"nom": nom, "telephone": tel, "role": role,
              "motDePasse": mdp, "tarifHoraire": tarif},
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


async def connecter(client: AsyncClient, tel: str, mdp="motdepasse123") -> str:
    reponse = await client.post(
        "/api/auth/connexion", json={"telephone": tel, "motDePasse": mdp}
    )
    assert reponse.status_code == 200, reponse.text
    return reponse.json()["jeton"]


async def creer_eleve(client: AsyncClient, jeton: str, *, nom="Traoré",
                      prenoms="Awa", tel="0555000111", montant=150000) -> dict:
    reponse = await client.post(
        "/api/eleves",
        headers=entete(jeton),
        json={"nom": nom, "prenoms": prenoms, "telephone": tel,
              "montantTotal": montant, "categorie": "B"},
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()
