"""Convocations à l'examen et documents PDF."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from tests.conftest import connecter, creer_agent, creer_eleve, entete, inscrire

DEBUT = datetime(2026, 11, 2, 8, 0)


async def _seances_conduite(client, jeton, eleve_id, moniteur_id, heures, *, depart=0):
    """Pose `heures` séances d'une heure, toutes marquées effectuées.

    `depart` décale les jours : sans lui, un second appel reposerait les mêmes
    créneaux et se ferait refuser par la détection de conflits — ce qui est le
    comportement attendu du serveur, pas un défaut.
    """
    for i in range(heures):
        debut = DEBUT + timedelta(days=depart + i)
        seance = await client.post(
            "/api/seances",
            headers=entete(jeton),
            json={"eleveId": eleve_id, "moniteurId": moniteur_id,
                  "debut": debut.isoformat(),
                  "fin": (debut + timedelta(hours=1)).isoformat()},
        )
        assert seance.status_code == 201, seance.text
        await client.patch(
            f"/api/seances/{seance.json()['id']}",
            headers=entete(jeton), json={"statut": "effectuee"},
        )


@pytest.mark.asyncio
async def test_une_convocation_n_est_etablie_qu_au_dela_du_seuil(client):
    """Le seuil est à 80 % des heures de conduite : 7 h sur 10 ne suffisent pas."""
    ecole = await inscrire(client)
    eleve = await client.post(
        "/api/eleves",
        headers=entete(ecole["jeton"]),
        json={"nom": "Traoré", "prenoms": "Awa", "telephone": "0555000111",
              "montantTotal": 150000, "heuresConduitePrevues": 10, "heuresCodePrevues": 10},
    )
    eleve_id = eleve.json()["id"]
    moniteur = await creer_agent(
        client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808",
    )

    await _seances_conduite(client, ecole["jeton"], eleve_id, moniteur["id"], 7)
    rien = await client.post("/api/convocations/verifier", headers=entete(ecole["jeton"]))
    assert rien.status_code == 200
    assert rien.json()["creees"] == 0

    await _seances_conduite(client, ecole["jeton"], eleve_id, moniteur["id"], 1, depart=7)
    # 8 h sur 10 = 80 %, le seuil est atteint.
    faite = await client.post("/api/convocations/verifier", headers=entete(ecole["jeton"]))
    assert faite.json()["creees"] == 1
    assert faite.json()["convocations"][0]["progression"] == 80


@pytest.mark.asyncio
async def test_relancer_la_verification_ne_cree_pas_de_doublon(client):
    ecole = await inscrire(client)
    eleve = await client.post(
        "/api/eleves",
        headers=entete(ecole["jeton"]),
        json={"nom": "Koné", "prenoms": "Ali", "telephone": "0555000222",
              "heuresConduitePrevues": 2, "heuresCodePrevues": 0},
    )
    moniteur = await creer_agent(
        client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808",
    )
    await _seances_conduite(client, ecole["jeton"], eleve.json()["id"], moniteur["id"], 2)

    premiere = await client.post("/api/convocations/verifier", headers=entete(ecole["jeton"]))
    seconde = await client.post("/api/convocations/verifier", headers=entete(ecole["jeton"]))
    assert premiere.json()["creees"] == 1
    assert seconde.json()["creees"] == 0

    liste = await client.get("/api/convocations", headers=entete(ecole["jeton"]))
    assert len(liste.json()) == 1


@pytest.mark.asyncio
async def test_les_convocations_restent_cloisonnees(client):
    a = await inscrire(client, nom="École A", tel="0701010101")
    b = await inscrire(client, nom="École B", tel="0702020202")

    eleve = await client.post(
        "/api/eleves",
        headers=entete(a["jeton"]),
        json={"nom": "Koné", "prenoms": "Ali", "telephone": "0555000222",
              "heuresConduitePrevues": 1, "heuresCodePrevues": 0},
    )
    moniteur = await creer_agent(client, a["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    await _seances_conduite(client, a["jeton"], eleve.json()["id"], moniteur["id"], 1)
    await client.post("/api/convocations/verifier", headers=entete(a["jeton"]))

    fiches_a = await client.get("/api/convocations", headers=entete(a["jeton"]))
    assert len(fiches_a.json()) == 1

    fiches_b = await client.get("/api/convocations", headers=entete(b["jeton"]))
    assert fiches_b.json() == []

    document = await client.get(
        f"/api/convocations/{fiches_a.json()[0]['id']}/document", headers=entete(b["jeton"]),
    )
    assert document.status_code == 404


@pytest.mark.asyncio
async def test_le_document_de_convocation_est_un_pdf(client):
    ecole = await inscrire(client)
    eleve = await client.post(
        "/api/eleves",
        headers=entete(ecole["jeton"]),
        json={"nom": "Traoré", "prenoms": "Awa", "telephone": "0555000111",
              "cni": "CI00123456", "heuresConduitePrevues": 1, "heuresCodePrevues": 0},
    )
    moniteur = await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    await _seances_conduite(client, ecole["jeton"], eleve.json()["id"], moniteur["id"], 1)
    await client.post("/api/convocations/verifier", headers=entete(ecole["jeton"]))

    fiche = (await client.get("/api/convocations", headers=entete(ecole["jeton"]))).json()[0]
    reponse = await client.get(
        f"/api/convocations/{fiche['id']}/document", headers=entete(ecole["jeton"]),
    )
    assert reponse.status_code == 200
    assert reponse.headers["content-type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")
    assert fiche["reference"] in reponse.headers["content-disposition"]


@pytest.mark.asyncio
async def test_le_recu_de_paiement_est_un_pdf(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=150000)
    paiement = await client.post(
        "/api/paiements",
        headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 50000, "moyen": "wave", "clientOpId": "p1"},
    )
    reponse = await client.get(
        f"/api/paiements/{paiement.json()['id']}/recu", headers=entete(ecole["jeton"]),
    )
    assert reponse.status_code == 200
    assert reponse.content.startswith(b"%PDF")
    assert len(reponse.content) > 1000  # un PDF vide ferait quelques octets


@pytest.mark.asyncio
async def test_un_moniteur_ne_peut_pas_etablir_de_convocation(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808")
    jeton = await connecter(client, "0708080808")

    refus = await client.post("/api/convocations/verifier", headers=entete(jeton))
    assert refus.status_code == 403


@pytest.mark.asyncio
async def test_la_liste_des_paiements_porte_le_nom_de_l_eleve(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], nom="Traoré", prenoms="Awa")
    await client.post(
        "/api/paiements",
        headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 10000, "moyen": "especes", "clientOpId": "p1"},
    )
    liste = await client.get("/api/paiements", headers=entete(ecole["jeton"]))
    assert liste.json()[0]["eleveNom"] == "Awa Traoré"


@pytest.mark.asyncio
async def test_la_paie_du_mois_est_reservee_au_directeur(client):
    ecole = await inscrire(client)
    await creer_agent(client, ecole["jeton"], role="secretaire", nom="Ama", tel="0709090909")
    jeton = await connecter(client, "0709090909")

    assert (await client.get("/api/personnel/paie", headers=entete(jeton))).status_code == 403
    assert (await client.get("/api/personnel/paie", headers=entete(ecole["jeton"]))).status_code == 200


@pytest.mark.asyncio
async def test_la_paie_ne_compte_que_les_heures_du_mois_courant(client):
    """Une séance d'un autre mois ne doit pas gonfler la paie à verser."""
    from datetime import date

    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    moniteur = await creer_agent(
        client, ecole["jeton"], role="moniteur", nom="Yao", tel="0708080808", tarif=2000,
    )

    aujourdhui = date.today()
    ce_mois = datetime(aujourdhui.year, aujourdhui.month, 1, 8, 0)
    autre_mois = ce_mois - timedelta(days=45)

    for debut in (ce_mois, autre_mois):
        seance = await client.post(
            "/api/seances",
            headers=entete(ecole["jeton"]),
            json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
                  "debut": debut.isoformat(), "fin": (debut + timedelta(hours=2)).isoformat()},
        )
        await client.patch(
            f"/api/seances/{seance.json()['id']}",
            headers=entete(ecole["jeton"]), json={"statut": "effectuee"},
        )

    paie = await client.get("/api/personnel/paie", headers=entete(ecole["jeton"]))
    ligne = paie.json()[0]
    assert ligne["heuresMois"] == 2          # les 2 h de l'autre mois sont écartées
    assert ligne["paieMois"] == 4000
    assert ligne["elevesSuivis"] == 1


@pytest.mark.asyncio
async def test_la_page_d_entree_n_est_jamais_mise_en_cache(client):
    """Sinon le navigateur réaffiche l'ancienne version après un déploiement.

    La page d'entrée garde toujours le même nom et pointe vers les fichiers du
    moment : mise en cache, elle fige l'application sur une version périmée.
    Les fichiers construits, eux, portent un nom haché et peuvent être gardés.
    """
    from pathlib import Path

    from server import InterfaceStatique

    # L'interface n'est pas forcément construite pendant les tests : on vérifie
    # la règle elle-même, sur la classe qui la porte.
    interface = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if not interface.is_dir():
        pytest.skip("Interface non construite : `yarn build` dans frontend/.")

    statique = InterfaceStatique(directory=interface, html=True)
    portee = {"type": "http", "method": "GET", "headers": []}

    page = await statique.get_response("index.html", portee)
    assert "no-cache" in page.headers["Cache-Control"]

    nom_hache = next(
        (f.name for f in (interface / "assets").iterdir() if f.suffix == ".js"), None,
    )
    if nom_hache:
        fichier = await statique.get_response(f"assets/{nom_hache}", portee)
        assert "immutable" in fichier.headers["Cache-Control"]
