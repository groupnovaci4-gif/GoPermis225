"""Parcours complets : inscription, encaissement, planning, portail élève."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from tests.conftest import connecter, creer_agent, creer_eleve, entete, inscrire

DEBUT = datetime(2026, 11, 2, 8, 0)


async def _moniteur(client, jeton, tel="0708080808", tarif=2500):
    return await creer_agent(
        client, jeton, role="moniteur", nom="Yao Kouassi", tel=tel, tarif=tarif
    )


@pytest.mark.asyncio
async def test_encaissement_idempotent(client):
    """Deux envois portant le même clientOpId ne créent qu'un paiement.

    C'est le scénario réel : la secrétaire valide, le réseau coupe avant la
    réponse, elle revalide. Sans idempotence, l'élève est débité deux fois.
    """
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=150_000)

    corps = {"eleveId": eleve["id"], "montant": 50_000, "moyen": "orange_money",
             "clientOpId": "op-unique-123"}

    premier = await client.post("/api/paiements", headers=entete(ecole["jeton"]), json=corps)
    second = await client.post("/api/paiements", headers=entete(ecole["jeton"]), json=corps)

    assert premier.status_code == 201
    assert second.status_code == 201
    assert premier.json()["id"] == second.json()["id"]
    assert premier.json()["numeroRecu"] == second.json()["numeroRecu"]

    liste = await client.get("/api/paiements", headers=entete(ecole["jeton"]))
    assert len(liste.json()) == 1

    detail = await client.get(f"/api/eleves/{eleve['id']}", headers=entete(ecole["jeton"]))
    assert detail.json()["solde"]["totalPaye"] == 50_000
    assert detail.json()["solde"]["reste"] == 100_000


@pytest.mark.asyncio
async def test_les_numeros_de_recu_se_suivent(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])

    numeros = []
    for i in range(3):
        reponse = await client.post(
            "/api/paiements",
            headers=entete(ecole["jeton"]),
            json={"eleveId": eleve["id"], "montant": 10_000, "moyen": "especes",
                  "clientOpId": f"op-{i}"},
        )
        numeros.append(reponse.json()["numeroRecu"])

    assert numeros == ["REC-AUT-000001", "REC-AUT-000002", "REC-AUT-000003"]


@pytest.mark.asyncio
async def test_conflit_de_planning_refuse_puis_forcable(client):
    ecole = await inscrire(client)
    eleve1 = await creer_eleve(client, ecole["jeton"], nom="Un", tel="0555111111")
    eleve2 = await creer_eleve(client, ecole["jeton"], nom="Deux", tel="0555222222")
    moniteur = await _moniteur(client, ecole["jeton"])

    creneau = {"moniteurId": moniteur["id"], "debut": DEBUT.isoformat(),
               "fin": (DEBUT + timedelta(hours=2)).isoformat()}

    premier = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve1["id"], **creneau},
    )
    assert premier.status_code == 201

    chevauche = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve2["id"], "moniteurId": moniteur["id"],
              "debut": (DEBUT + timedelta(hours=1)).isoformat(),
              "fin": (DEBUT + timedelta(hours=3)).isoformat()},
    )
    assert chevauche.status_code == 409
    assert chevauche.json()["detail"]["conflits"][0]["motif"] == "moniteur"

    # Le directeur garde la main : un conflit est un avertissement, pas un mur.
    force = await client.post(
        "/api/seances?forcer=true", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve2["id"], "moniteurId": moniteur["id"],
              "debut": (DEBUT + timedelta(hours=1)).isoformat(),
              "fin": (DEBUT + timedelta(hours=3)).isoformat()},
    )
    assert force.status_code == 201


@pytest.mark.asyncio
async def test_un_moniteur_cloture_sa_seance_mais_pas_celle_d_un_autre(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    m1 = await _moniteur(client, ecole["jeton"], tel="0708080808")
    m2 = await _moniteur(client, ecole["jeton"], tel="0709090909")

    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": m1["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=1)).isoformat()},
    )
    seance_id = seance.json()["id"]

    jeton_m2 = await connecter(client, "0709090909")
    refus = await client.patch(
        f"/api/seances/{seance_id}", headers=entete(jeton_m2), json={"statut": "effectuee"}
    )
    assert refus.status_code == 403

    jeton_m1 = await connecter(client, "0708080808")
    ok = await client.patch(
        f"/api/seances/{seance_id}", headers=entete(jeton_m1), json={"statut": "effectuee"}
    )
    assert ok.status_code == 200
    assert ok.json()["statut"] == "effectuee"


@pytest.mark.asyncio
async def test_un_moniteur_ne_peut_pas_deplacer_une_seance(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    moniteur = await _moniteur(client, ecole["jeton"])

    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=1)).isoformat()},
    )
    jeton = await connecter(client, "0708080808")
    refus = await client.patch(
        f"/api/seances/{seance.json()['id']}",
        headers=entete(jeton),
        json={"debut": (DEBUT + timedelta(days=1)).isoformat()},
    )
    assert refus.status_code == 403


@pytest.mark.asyncio
async def test_une_annulation_exige_un_motif(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    moniteur = await _moniteur(client, ecole["jeton"])

    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=1)).isoformat()},
    )
    sans_motif = await client.patch(
        f"/api/seances/{seance.json()['id']}",
        headers=entete(ecole["jeton"]), json={"statut": "annulee"},
    )
    assert sans_motif.status_code == 422

    avec_motif = await client.patch(
        f"/api/seances/{seance.json()['id']}",
        headers=entete(ecole["jeton"]),
        json={"statut": "annulee", "motif": "Véhicule en panne"},
    )
    assert avec_motif.status_code == 200


@pytest.mark.asyncio
async def test_une_seance_effectuee_ne_se_supprime_pas(client):
    """Elle porte des heures comptées dans la progression et le salaire."""
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    moniteur = await _moniteur(client, ecole["jeton"])

    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=1)).isoformat()},
    )
    seance_id = seance.json()["id"]
    await client.patch(
        f"/api/seances/{seance_id}", headers=entete(ecole["jeton"]), json={"statut": "effectuee"}
    )
    refus = await client.delete(f"/api/seances/{seance_id}", headers=entete(ecole["jeton"]))
    assert refus.status_code == 409


@pytest.mark.asyncio
async def test_le_changement_de_statut_empile_un_historique(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])

    await client.post(
        f"/api/eleves/{eleve['id']}/statut", headers=entete(ecole["jeton"]),
        json={"statut": "suspendu", "motif": "Impayé de 3 mois"},
    )
    await client.post(
        f"/api/eleves/{eleve['id']}/statut", headers=entete(ecole["jeton"]),
        json={"statut": "actif", "motif": "Régularisation"},
    )

    detail = await client.get(f"/api/eleves/{eleve['id']}", headers=entete(ecole["jeton"]))
    historique = detail.json()["eleve"]["historiqueStatuts"]
    assert [h["statut"] for h in historique] == ["suspendu", "actif"]
    assert historique[0]["motif"] == "Impayé de 3 mois"
    assert detail.json()["eleve"]["statut"] == "actif"


@pytest.mark.asyncio
async def test_le_portail_eleve_ne_montre_que_son_dossier(client):
    ecole = await inscrire(client)
    moi = await creer_eleve(client, ecole["jeton"], nom="Moi", tel="0555111111")
    await creer_eleve(client, ecole["jeton"], nom="Autre", tel="0555222222")

    echange = await client.post("/api/auth/portail", json={"jeton": moi["portailJeton"]})
    assert echange.status_code == 200
    jeton_eleve = echange.json()["jeton"]

    dossier = await client.get("/api/portail", headers=entete(jeton_eleve))
    assert dossier.status_code == 200
    assert dossier.json()["eleve"]["nom"] == "Moi"

    # Un jeton élève n'ouvre aucune porte du côté école.
    for chemin in ("/api/eleves", "/api/paiements", "/api/tableau-bord",
                   "/api/personnel", "/api/depenses"):
        reponse = await client.get(chemin, headers=entete(jeton_eleve))
        assert reponse.status_code == 403, chemin


@pytest.mark.asyncio
async def test_un_lien_portail_regenere_invalide_l_ancien(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"])
    ancien = eleve["portailJeton"]

    nouveau = await client.post(
        f"/api/eleves/{eleve['id']}/lien-portail", headers=entete(ecole["jeton"])
    )
    assert nouveau.status_code == 200
    assert nouveau.json()["portailJeton"] != ancien

    perime = await client.post("/api/auth/portail", json={"jeton": ancien})
    assert perime.status_code == 401


@pytest.mark.asyncio
async def test_le_jeton_portail_ne_fuite_pas_dans_les_listes(client):
    """Ce jeton vaut mot de passe : il ne doit apparaître qu'à la création."""
    ecole = await inscrire(client)
    await creer_eleve(client, ecole["jeton"])

    liste = await client.get("/api/eleves", headers=entete(ecole["jeton"]))
    assert "portailJeton" not in liste.text

    detail_id = liste.json()[0]["id"]
    detail = await client.get(f"/api/eleves/{detail_id}", headers=entete(ecole["jeton"]))
    assert "portailJeton" not in detail.text


@pytest.mark.asyncio
async def test_le_tableau_de_bord_agrege_le_parcours_complet(client):
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=200_000)
    moniteur = await _moniteur(client, ecole["jeton"], tarif=3_000)

    await client.post(
        "/api/paiements", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 80_000, "moyen": "wave", "clientOpId": "p1"},
    )
    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=2)).isoformat()},
    )
    await client.patch(
        f"/api/seances/{seance.json()['id']}", headers=entete(ecole["jeton"]),
        json={"statut": "effectuee"},
    )

    bord = await client.get("/api/tableau-bord", headers=entete(ecole["jeton"]))
    assert bord.status_code == 200
    donnees = bord.json()
    assert donnees["kpis"]["elevesActifs"] == 1
    assert donnees["kpis"]["encaisseTotal"] == 80_000
    assert donnees["kpis"]["resteARecouvrer"] == 120_000
    assert len(donnees["revenusParMois"]) == 12

    perf = donnees["performanceMoniteurs"][0]
    assert perf["heures"] == 2
    assert perf["montant"] == 6_000


@pytest.mark.asyncio
async def test_la_liste_des_impayes_est_triee_par_reste(client):
    ecole = await inscrire(client)
    petit = await creer_eleve(client, ecole["jeton"], nom="Petit", tel="0555111111", montant=50_000)
    gros = await creer_eleve(client, ecole["jeton"], nom="Gros", tel="0555222222", montant=300_000)
    solde = await creer_eleve(client, ecole["jeton"], nom="Solde", tel="0555333333", montant=20_000)

    await client.post(
        "/api/paiements", headers=entete(ecole["jeton"]),
        json={"eleveId": solde["id"], "montant": 20_000, "moyen": "especes", "clientOpId": "x"},
    )

    impayes = await client.get("/api/impayes", headers=entete(ecole["jeton"]))
    assert impayes.status_code == 200
    lignes = impayes.json()
    assert [l["nom"] for l in lignes] == ["Gros", "Petit"]  # Solde est exclu
    assert lignes[0]["reste"] == 300_000


@pytest.mark.asyncio
async def test_le_journal_d_audit_enregistre_l_acteur(client):
    ecole = await inscrire(client, directeur="M. Koffi")
    await creer_eleve(client, ecole["jeton"])

    journal = await client.get("/api/ecole/journal", headers=entete(ecole["jeton"]))
    assert journal.status_code == 200
    actions = [e["action"] for e in journal.json()]
    assert "eleve.cree" in actions
    entree = next(e for e in journal.json() if e["action"] == "eleve.cree")
    assert entree["acteurNom"] == "M. Koffi"
    assert entree["acteurId"]  # posé par le serveur, pas par le client


@pytest.mark.asyncio
async def test_un_numero_de_telephone_invalide_est_refuse(client):
    ecole = await inscrire(client)
    reponse = await client.post(
        "/api/eleves", headers=entete(ecole["jeton"]),
        json={"nom": "Test", "prenoms": "Essai", "telephone": "123"},
    )
    assert reponse.status_code == 422


@pytest.mark.asyncio
async def test_la_liste_des_eleves_porte_progression_et_solde(client):
    """Sans cela, l'écran appellerait l'API une fois par élève."""
    ecole = await inscrire(client)
    eleve = await creer_eleve(client, ecole["jeton"], montant=100_000)
    moniteur = await _moniteur(client, ecole["jeton"])

    seance = await client.post(
        "/api/seances", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "moniteurId": moniteur["id"],
              "debut": DEBUT.isoformat(), "fin": (DEBUT + timedelta(hours=2)).isoformat()},
    )
    await client.patch(
        f"/api/seances/{seance.json()['id']}", headers=entete(ecole["jeton"]),
        json={"statut": "effectuee"},
    )
    await client.post(
        "/api/paiements", headers=entete(ecole["jeton"]),
        json={"eleveId": eleve["id"], "montant": 40_000, "moyen": "wave", "clientOpId": "x"},
    )

    liste = await client.get("/api/eleves", headers=entete(ecole["jeton"]))
    ligne = liste.json()[0]
    assert ligne["progression"]["heuresConduiteFaites"] == 2
    assert ligne["solde"]["reste"] == 60_000
    assert ligne["solde"]["tauxRecouvrement"] == 40
    # Le jeton de portail ne doit jamais apparaître dans une liste.
    assert "portailJeton" not in ligne
