"""File WhatsApp : règles de préparation, déduplication, cloisonnement."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from tests.conftest import connecter, creer_agent, creer_eleve, entete, inscrire


async def _seance_demain(client, jeton, eleve_id, moniteur_id):
    demain = datetime.combine(date.today() + timedelta(days=1), datetime.min.time())
    debut = demain.replace(hour=9)
    reponse = await client.post(
        "/api/seances",
        headers=entete(jeton),
        json={"eleveId": eleve_id, "moniteurId": moniteur_id,
              "debut": debut.isoformat(), "fin": (debut + timedelta(hours=1)).isoformat(),
              "lieu": "Rond-point de la Sicogi"},
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


@pytest.mark.asyncio
async def test_un_rappel_est_prepare_pour_les_seances_du_lendemain(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], prenoms="Awa", montant=0)
    moniteur = await creer_agent(
        client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808",
    )
    await _seance_demain(client, ecole["jeton"], eleve["id"], moniteur["id"])

    prepare = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    assert prepare.status_code == 200

    rappels = [m for m in prepare.json()["messages"] if m["motif"] == "rappel_seance"]
    assert len(rappels) == 1
    assert "Awa" in rappels[0]["texte"]
    assert "09:00" in rappels[0]["texte"]
    assert "Sicogi" in rappels[0]["texte"]


@pytest.mark.asyncio
async def test_preparer_deux_fois_ne_duplique_pas(client):
    """Un élève relancé trois fois le même jour cesse de lire."""
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=0)
    moniteur = await creer_agent(
        client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808",
    )
    await _seance_demain(client, ecole["jeton"], eleve["id"], moniteur["id"])

    premiere = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    seconde = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    assert premiere.json()["prepares"] == 1
    assert seconde.json()["prepares"] == 0

    file = await client.get("/api/whatsapp", headers=entete(ecole["jeton"]))
    assert len(file.json()) == 1


@pytest.mark.asyncio
async def test_un_seul_palier_de_relance_a_la_fois(client):
    """Un retard de 30 jours ne doit pas produire les relances 7, 15 ET 30."""
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=150000)

    # Un versement ancien : le retard se compte depuis lui.
    ancien = (date.today() - timedelta(days=40)).isoformat()
    await client.post(
        "/api/paiements",
        headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 20000, "moyen": "especes",
              "date": ancien, "clientOpId": "vieux"},
    )

    prepare = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    relances = [m for m in prepare.json()["messages"] if m["motif"] == "relance_impaye"]
    assert len(relances) == 1
    assert relances[0]["cle"].endswith(":30")
    # Montant séparé par milliers : c'est lu par un élève, pas par une machine.
    assert "130 000 FCFA" in relances[0]["texte"]


@pytest.mark.asyncio
async def test_un_eleve_a_jour_n_est_pas_relance(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=50000)
    await client.post(
        "/api/paiements",
        headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 50000, "moyen": "wave", "clientOpId": "solde"},
    )
    prepare = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    assert [m for m in prepare.json()["messages"] if m["motif"] == "relance_impaye"] == []


@pytest.mark.asyncio
async def test_felicitations_pour_un_permis_obtenu(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], prenoms="Fatou", montant=0)
    await client.post(
        f"/api/eleves/{eleve['id']}/statut",
        headers=entete(ecole["jeton"]),
        json={"statut": "diplome", "motif": "Examen réussi"},
    )
    prepare = await client.post("/api/whatsapp/preparer", headers=entete(ecole["jeton"]))
    felicitations = [m for m in prepare.json()["messages"] if m["motif"] == "felicitations"]
    assert len(felicitations) == 1
    assert "Fatou" in felicitations[0]["texte"]


@pytest.mark.asyncio
async def test_marquer_envoye_est_idempotent(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=0)
    message = await client.post(
        "/api/whatsapp",
        headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "texte": "Bonjour, votre attestation est prête."},
    )
    assert message.status_code == 201
    identifiant = message.json()["id"]

    premier = await client.post(
        f"/api/whatsapp/{identifiant}/envoye", headers=entete(ecole["jeton"]),
    )
    second = await client.post(
        f"/api/whatsapp/{identifiant}/envoye", headers=entete(ecole["jeton"]),
    )
    assert premier.json()["statut"] == "envoye"
    assert second.json()["statut"] == "envoye"
    # L'horodatage du premier envoi n'est pas réécrit par le second.
    assert premier.json()["envoyeLe"] == second.json()["envoyeLe"]


@pytest.mark.asyncio
async def test_la_file_reste_cloisonnee_entre_ecoles(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await creer_eleve(client, a["jeton"], tel="0555111222", montant=0)
    message = await client.post(
        "/api/whatsapp",
        headers=entete(a["jeton"]),
        json={"eleveId": eleve["id"], "texte": "Message interne."},
    )
    assert (await client.get("/api/whatsapp", headers=entete(b["jeton"]))).json() == []
    refus = await client.post(
        f"/api/whatsapp/{message.json()['id']}/envoye", headers=entete(b["jeton"]),
    )
    assert refus.status_code == 404


@pytest.mark.asyncio
async def test_un_moniteur_n_accede_pas_a_la_file(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    jeton = await connecter(client, "0708080808")

    assert (await client.get("/api/whatsapp", headers=entete(jeton))).status_code == 403
    assert (await client.post("/api/whatsapp/preparer", headers=entete(jeton))).status_code == 403
