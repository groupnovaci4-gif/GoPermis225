"""Connexion : anti-force-brute, non-divulgation, hachage."""
from __future__ import annotations

import time

import pytest

from lib.securite import (
    VerrouConnexion,
    bruler_temps_secret,
    hacher_secret,
    verifier_secret,
)
from tests.conftest import entete, inscrire


def test_le_secret_n_est_jamais_stocke_en_clair():
    empreinte = hacher_secret("motdepasse123")
    assert "motdepasse123" not in empreinte
    assert empreinte.startswith("pbkdf2_sha256$")
    assert verifier_secret("motdepasse123", empreinte)
    assert not verifier_secret("motdepasse124", empreinte)


def test_deux_hachages_du_meme_secret_different():
    """Sel aléatoire : sans lui, deux comptes avec le même mot de passe
    auraient la même empreinte, ce qui se lit dans une base volée."""
    assert hacher_secret("identique") != hacher_secret("identique")


def test_une_empreinte_corrompue_ne_leve_pas():
    for mauvais in ("", "n'importe quoi", "pbkdf2_sha256$abc$def", "a$b$c$d"):
        assert verifier_secret("x", mauvais) is False


def test_le_verrou_bloque_apres_n_echecs():
    verrou = VerrouConnexion(max_echecs=3, duree_blocage=60)
    assert verrou.verifier("0701020304") == 0
    for _ in range(3):
        verrou.noter_echec("0701020304")
    assert verrou.verifier("0701020304") > 0


def test_le_verrou_porte_sur_l_identifiant_pas_sur_l_appelant():
    """Bloquer un numéro ne doit pas bloquer les autres : sinon un attaquant
    verrouille tout le monde en échouant volontairement."""
    verrou = VerrouConnexion(max_echecs=2, duree_blocage=60)
    for _ in range(2):
        verrou.noter_echec("0701020304")
    assert verrou.verifier("0701020304") > 0
    assert verrou.verifier("0709999999") == 0


def test_une_connexion_reussie_remet_le_compteur_a_zero():
    verrou = VerrouConnexion(max_echecs=3, duree_blocage=60)
    verrou.noter_echec("0701020304")
    verrou.noter_echec("0701020304")
    verrou.noter_succes("0701020304")
    verrou.noter_echec("0701020304")
    assert verrou.verifier("0701020304") == 0


@pytest.mark.asyncio
async def test_connexion_bloquee_apres_trop_d_echecs(client):
    await inscrire(client, tel="0701020304", mdp="motdepasse123")

    for _ in range(3):  # login_max_fails = 3 en test
        reponse = await client.post(
            "/api/auth/connexion",
            json={"telephone": "0701020304", "motDePasse": "faux"},
        )
        assert reponse.status_code == 401

    # Même avec le bon mot de passe, le compte est verrouillé.
    bloque = await client.post(
        "/api/auth/connexion",
        json={"telephone": "0701020304", "motDePasse": "motdepasse123"},
    )
    assert bloque.status_code == 429


@pytest.mark.asyncio
async def test_numero_inconnu_et_mauvais_mot_de_passe_sont_indiscernables(client):
    await inscrire(client, tel="0701020304", mdp="motdepasse123")

    inconnu = await client.post(
        "/api/auth/connexion", json={"telephone": "0799999999", "motDePasse": "peu importe"}
    )
    mauvais = await client.post(
        "/api/auth/connexion", json={"telephone": "0701020304", "motDePasse": "faux"}
    )
    assert inconnu.status_code == mauvais.status_code == 401
    assert inconnu.json()["detail"] == mauvais.json()["detail"]


def test_le_temps_de_calcul_ne_trahit_pas_l_absence_de_compte():
    """Un numéro inconnu doit coûter à peu près le même temps qu'un mauvais
    mot de passe. Sinon la durée de réponse permet d'énumérer les comptes."""
    empreinte = hacher_secret("reference")

    debut = time.perf_counter()
    verifier_secret("mauvais", empreinte)
    duree_verification = time.perf_counter() - debut

    debut = time.perf_counter()
    bruler_temps_secret()
    duree_brulage = time.perf_counter() - debut

    # Tolérance large : on vérifie l'ordre de grandeur, pas une égalité
    # stricte, qui rendrait le test instable selon la charge de la machine.
    assert 0.2 < duree_brulage / duree_verification < 5.0


@pytest.mark.asyncio
async def test_un_compte_desactive_ne_peut_plus_se_connecter(client):
    ecole = await inscrire(client)
    agent = await client.post(
        "/api/personnel",
        headers=entete(ecole["jeton"]),
        json={"nom": "Yao", "telephone": "0708080808", "role": "moniteur",
              "motDePasse": "motdepasse123"},
    )
    assert (await client.post(
        "/api/auth/connexion",
        json={"telephone": "0708080808", "motDePasse": "motdepasse123"},
    )).status_code == 200

    await client.patch(
        f"/api/personnel/{agent.json()['id']}",
        headers=entete(ecole["jeton"]),
        json={"actif": False},
    )
    refuse = await client.post(
        "/api/auth/connexion",
        json={"telephone": "0708080808", "motDePasse": "motdepasse123"},
    )
    assert refuse.status_code == 403


@pytest.mark.asyncio
async def test_deux_ecoles_ne_peuvent_pas_partager_un_numero(client):
    await inscrire(client, nom="École A", tel="0701020304")
    doublon = await client.post(
        "/api/auth/inscription",
        json={"nomEcole": "École B", "commune": "Bouaké", "nomDirecteur": "Autre",
              "telephone": "0701020304", "motDePasse": "motdepasse123"},
    )
    assert doublon.status_code == 409
