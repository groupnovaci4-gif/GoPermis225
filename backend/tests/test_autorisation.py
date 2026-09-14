"""Matrice d'autorisation : les garde-fous d'interface ne comptent pas.

Chaque test appelle l'API directement, comme le ferait quelqu'un qui contourne
l'interface. C'est le seul niveau où l'autorisation compte vraiment.
"""
from __future__ import annotations

import pytest

from tests.conftest import connecter, creer_agent, creer_eleve, entete, inscrire


@pytest.mark.asyncio
async def test_un_moniteur_ne_peut_pas_creer_un_eleve(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    jeton = await connecter(client, "0708080808")

    reponse = await client.post(
        "/api/eleves",
        headers=entete(jeton),
        json={"nom": "Test", "prenoms": "Essai", "telephone": "0555000111"},
    )
    assert reponse.status_code == 403


@pytest.mark.asyncio
async def test_un_moniteur_ne_peut_pas_encaisser(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    jeton = await connecter(client, "0708080808")

    reponse = await client.post(
        "/api/paiements",
        headers=entete(jeton),
        json={"eleveId": eleve["id"], "montant": 10000, "moyen": "especes"},
    )
    assert reponse.status_code == 403


@pytest.mark.asyncio
async def test_une_secretaire_ne_peut_pas_gerer_le_personnel(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="secretaire", nom="Ama", tel="0709090909")
    jeton = await connecter(client, "0709090909")

    reponse = await client.post(
        "/api/personnel",
        headers=entete(jeton),
        json={"nom": "Intrus", "telephone": "0710101010", "role": "moniteur",
              "motDePasse": "motdepasse123"},
    )
    assert reponse.status_code == 403


@pytest.mark.asyncio
async def test_une_secretaire_ne_peut_pas_annuler_un_paiement(client):
    """Annuler une écriture comptable est une décision de directeur : la
    personne qui saisit ne doit pas pouvoir effacer sa propre saisie."""
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    await creer_agent(client, ecole["jeton"], role="secretaire", nom="Ama", tel="0709090909")
    jeton_secretaire = await connecter(client, "0709090909")

    paiement = await client.post(
        "/api/paiements",
        headers=entete(jeton_secretaire),
        json={"eleveId": eleve["id"], "montant": 25000, "moyen": "wave"},
    )
    assert paiement.status_code == 201

    annulation = await client.delete(
        f"/api/paiements/{paiement.json()['id']}", headers=entete(jeton_secretaire)
    )
    assert annulation.status_code == 403

    # Le directeur, lui, peut.
    ok = await client.delete(
        f"/api/paiements/{paiement.json()['id']}", headers=entete(ecole["jeton"])
    )
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_une_secretaire_ne_voit_pas_le_tableau_de_bord_financier(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="secretaire", nom="Ama", tel="0709090909")
    jeton = await connecter(client, "0709090909")

    assert (await client.get("/api/tableau-bord", headers=entete(jeton))).status_code == 403
    assert (await client.get("/api/ecole/journal", headers=entete(jeton))).status_code == 403
    # Le résumé du jour, lui, lui est ouvert : c'est son outil de travail.
    assert (await client.get("/api/tableau-bord/aujourdhui", headers=entete(jeton))).status_code == 200


@pytest.mark.asyncio
async def test_un_moniteur_ne_voit_que_ses_eleves(client):
    from datetime import datetime, timedelta

    ecole = await inscrire(client)
    suivi = await creer_eleve(client, ecole["jeton"], nom="Suivi", tel="0555111111")
    autre = await creer_eleve(client, ecole["jeton"], nom="Autre", tel="0555222222")
    moniteur = await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")

    debut = datetime(2026, 10, 1, 8, 0)
    await client.post(
        "/api/seances",
        headers=entete(ecole["jeton"]),
        json={"eleveId": suivi["id"], "moniteurId": moniteur["id"],
              "debut": debut.isoformat(), "fin": (debut + timedelta(hours=1)).isoformat()},
    )

    jeton = await connecter(client, "0708080808")
    liste = await client.get("/api/eleves", headers=entete(jeton))
    assert liste.status_code == 200
    noms = {e["nom"] for e in liste.json()}
    assert noms == {"Suivi"}

    # L'élève qu'il ne forme pas lui est invisible, même par identifiant direct.
    assert (await client.get(f"/api/eleves/{autre['id']}", headers=entete(jeton))).status_code == 404


@pytest.mark.asyncio
async def test_sans_jeton_tout_est_refuse(client):
    assert (await client.get("/api/eleves")).status_code == 401
    assert (await client.get("/api/tableau-bord")).status_code == 401
    assert (await client.get("/api/paiements")).status_code == 401


@pytest.mark.asyncio
async def test_un_jeton_forge_est_rejete(client):
    await inscrire(client)
    faux = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiJwaXJhdGUiLCJlY29sZUlkIjoieCIsImNvdGUiOiJlY29sZSIsInJvbGUiOiJkaXJlY3RldXIifQ."
        "signature-bidon"
    )
    assert (await client.get("/api/eleves", headers=entete(faux))).status_code == 401


@pytest.mark.asyncio
async def test_un_directeur_ne_peut_pas_se_desactiver(client):
    """Sinon l'école se retrouve sans personne pour réactiver quoi que ce soit."""
    ecole = await inscrire(client)
    moi = await client.get("/api/auth/moi", headers=entete(ecole["jeton"]))
    mon_id = moi.json()["id"]

    reponse = await client.patch(
        f"/api/personnel/{mon_id}", headers=entete(ecole["jeton"]), json={"actif": False}
    )
    assert reponse.status_code == 409


@pytest.mark.asyncio
async def test_l_empreinte_du_mot_de_passe_ne_sort_jamais(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")

    reponse = await client.get("/api/personnel", headers=entete(ecole["jeton"]))
    assert reponse.status_code == 200
    corps = reponse.text
    assert "empreinte" not in corps
    assert "pbkdf2" not in corps.lower()
