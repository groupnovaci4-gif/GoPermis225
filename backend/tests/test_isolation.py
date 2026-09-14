"""Cloisonnement entre auto-écoles — la garantie la plus importante.

Si un seul de ces tests tombe, le produit n'est pas vendable : une auto-école
verrait les élèves et les recettes d'une concurrente.
"""
from __future__ import annotations

import pytest

from tests.conftest import creer_eleve, entete, inscrire


@pytest.mark.asyncio
async def test_une_ecole_ne_voit_pas_les_eleves_d_une_autre(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    await creer_eleve(client, a["jeton"], nom="Koné", prenoms="Ali", tel="0555111222")

    liste_b = await client.get("/api/eleves", headers=entete(b["jeton"]))
    assert liste_b.status_code == 200
    assert liste_b.json() == []


@pytest.mark.asyncio
async def test_lire_un_eleve_d_une_autre_ecole_renvoie_404(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await creer_eleve(client, a["jeton"], tel="0555111222")

    reponse = await client.get(f"/api/eleves/{eleve['id']}", headers=entete(b["jeton"]))
    # 404 et non 403 : un 403 confirmerait que cet identifiant existe ailleurs.
    assert reponse.status_code == 404


@pytest.mark.asyncio
async def test_modifier_un_eleve_d_une_autre_ecole_est_impossible(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await creer_eleve(client, a["jeton"], tel="0555111222")

    reponse = await client.patch(
        f"/api/eleves/{eleve['id']}",
        headers=entete(b["jeton"]),
        json={"nom": "Piraté"},
    )
    assert reponse.status_code == 404

    # La fiche d'origine est intacte.
    verif = await client.get(f"/api/eleves/{eleve['id']}", headers=entete(a["jeton"]))
    assert verif.json()["eleve"]["nom"] == "Traoré"


@pytest.mark.asyncio
async def test_les_paiements_restent_cloisonnes(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await creer_eleve(client, a["jeton"], tel="0555111222")
    encaisse = await client.post(
        "/api/paiements",
        headers=entete(a["jeton"]),
        json={"eleveId": eleve["id"], "montant": 50000, "moyen": "especes"},
    )
    assert encaisse.status_code == 201

    liste_b = await client.get("/api/paiements", headers=entete(b["jeton"]))
    assert liste_b.json() == []


@pytest.mark.asyncio
async def test_encaisser_pour_un_eleve_d_une_autre_ecole_echoue(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await creer_eleve(client, a["jeton"], tel="0555111222")

    reponse = await client.post(
        "/api/paiements",
        headers=entete(b["jeton"]),
        json={"eleveId": eleve["id"], "montant": 50000, "moyen": "especes"},
    )
    assert reponse.status_code == 404


@pytest.mark.asyncio
async def test_matricules_independants_entre_ecoles(client):
    """Deux écoles peuvent avoir le même matricule : les séquences sont
    propres à chacune. Une séquence globale ferait fuiter le rythme
    d'inscription d'une école à ses concurrentes."""
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    e_a = await creer_eleve(client, a["jeton"], tel="0555111222")
    e_b = await creer_eleve(client, b["jeton"], tel="0555333444")

    assert e_a["matricule"].endswith("0001")
    assert e_b["matricule"].endswith("0001")
