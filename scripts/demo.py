"""Lance l'API sur une base EN MÉMOIRE, avec un jeu de données de démonstration.

Usage : python scripts/demo.py

Destiné à la démonstration et aux tests d'interface uniquement — les données
disparaissent à l'arrêt du processus. Pour un vrai serveur : voir README.md.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(RACINE))

from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from lib.config import Config  # noqa: E402
from lib.db import configurer_db  # noqa: E402
from lib.securite import hacher_secret, jeton_opaque  # noqa: E402
from models.communs import maintenant, nouvel_id  # noqa: E402

CONFIG = Config(
    mongo_url="memoire://demo",
    db_name="demo",
    jwt_secret="demonstration-seulement-ne-jamais-utiliser-en-production-1234",
    jwt_expire_minutes=720,
    cors_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    login_max_fails=20,
    login_lock_seconds=60,
)

BASE = AsyncMongoMockClient()["demo"]
configurer_db(lambda: BASE)


async def semer() -> None:
    """Jeu de données minimal : une école, un directeur, un moniteur, 3 élèves."""
    ecole_id = nouvel_id()
    await BASE["ecoles"].insert_one(
        {
            "id": ecole_id, "ecoleId": ecole_id, "nom": "Auto-École La Réussite",
            "commune": "Yopougon", "telephone": "0707070707", "adresse": "Sicogi, Yopougon",
            "agrement": "AG-2026-118", "logoUrl": "",
            "tarifParCategorie": {"A": 90000, "B": 150000, "C": 250000},
            "heuresCodeParDefaut": 20, "heuresConduiteParDefaut": 20,
            "creeLe": maintenant(), "modifieLe": maintenant(),
        }
    )

    directeur_id = nouvel_id()
    moniteurs = [
        {"id": nouvel_id(), "nom": "Yao Kouassi", "telephone": "0708080808",
         "role": "moniteur", "tarifHoraire": 2500, "permisEnseigner": "MON-CI-4023"},
        {"id": nouvel_id(), "nom": "Aya Bernadette", "telephone": "0709090909",
         "role": "moniteur", "tarifHoraire": 2200, "permisEnseigner": "MON-CI-4412"},
        {"id": nouvel_id(), "nom": "Bamba Seydou", "telephone": "0710101010",
         "role": "moniteur", "tarifHoraire": 2800, "permisEnseigner": "MON-CI-5178"},
    ]
    moniteur_id = moniteurs[0]["id"]

    for agent in [
        {"id": directeur_id, "nom": "M. Koffi Anzoumana", "telephone": "0701020304",
         "role": "directeur", "tarifHoraire": 0, "permisEnseigner": ""},
        {"id": nouvel_id(), "nom": "Adjoua Konan", "telephone": "0505050505",
         "role": "secretaire", "tarifHoraire": 0, "permisEnseigner": ""},
        *moniteurs,
    ]:
        await BASE["utilisateurs"].insert_one(
            {**agent, "ecoleId": ecole_id, "actif": True, "note": "",
             "empreinte": hacher_secret("demo1234"),
             "creeLe": maintenant(), "modifieLe": maintenant()}
        )

    # (nom, prénoms, téléphone, frais, statut, index, heures de conduite faites)
    eleves = [
        ("Traoré", "Awa", "0555111111", 150000, "actif", 1, 4),
        ("Koné", "Ibrahim", "0555222222", 150000, "actif", 2, 17),
        ("Bamba", "Fatou", "0555333333", 90000, "diplome", 3, 20),
        ("N'Guessan", "Serge", "0555444444", 150000, "actif", 4, 18),
        ("Diomandé", "Mariam", "0555555555", 150000, "actif", 5, 11),
        ("Yapo", "Nadège", "0555666666", 250000, "actif", 6, 2),
        ("Gbagbo", "Arsène", "0555777777", 150000, "suspendu", 7, 8),
        ("Assi", "Emmanuel", "0555888888", 150000, "abandon", 8, 3),
    ]
    for nom, prenoms, tel, montant, statut, index, heures_faites in eleves:
        eleve_id = nouvel_id()
        await BASE["eleves"].insert_one(
            {
                "id": eleve_id, "ecoleId": ecole_id,
                "matricule": f"GP-{date.today().year}-{index:04d}",
                "nom": nom, "prenoms": prenoms, "telephone": tel, "telephoneTuteur": "",
                "cni": "", "dateNaissance": None, "commune": "Yopougon", "photoUrl": "",
                "categorie": "B", "statut": statut,
                "dateInscription": date.today().isoformat(),
                "montantTotal": montant, "heuresCodePrevues": 20,
                "heuresConduitePrevues": 20,
                "resultatCode": "admis" if statut == "diplome" else "en_attente",
                "resultatConduite": "admis" if statut == "diplome" else "en_attente",
                "datePermis": None, "historiqueStatuts": [],
                "portailJeton": jeton_opaque(),
                "creeLe": maintenant(), "modifieLe": maintenant(),
            }
        )
        await BASE["paiements"].insert_one(
            {
                "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                "montant": montant // 2, "moyen": "orange_money",
                "date": date.today().isoformat(), "reference": "",
                "numeroRecu": f"REC-AUT-{index:06d}", "encaissePar": directeur_id,
                "note": "", "clientOpId": f"demo-{index}",
                "creeLe": maintenant(), "modifieLe": maintenant(),
            }
        )
        # Séances passées, marquées effectuées : elles portent la progression.
        moniteur = moniteurs[index % len(moniteurs)]
        base_jour = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
        for h in range(heures_faites):
            debut = base_jour - timedelta(days=h + 1, hours=(index % 5))
            await BASE["seances"].insert_one(
                {
                    "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                    "moniteurId": moniteur["id"], "vehiculeId": "", "type": "conduite",
                    "debut": debut, "fin": debut + timedelta(hours=1),
                    "statut": "effectuee", "lieu": "Devant l'auto-école",
                    "motif": "", "kilometrage": 0, "creePar": directeur_id,
                    "creeLe": maintenant(), "modifieLe": maintenant(),
                }
            )
        # Une séance à venir cette semaine, pour peupler le planning.
        if statut == "actif":
            prochain = base_jour + timedelta(days=(index % 5) + 1, hours=index % 4)
            await BASE["seances"].insert_one(
                {
                    "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                    "moniteurId": moniteur["id"], "vehiculeId": "", "type": "conduite",
                    "debut": prochain, "fin": prochain + timedelta(hours=1),
                    "statut": "planifiee", "lieu": "Rond-point de la Sicogi",
                    "motif": "", "kilometrage": 0, "creePar": directeur_id,
                    "creeLe": maintenant(), "modifieLe": maintenant(),
                }
            )

    # Le compteur doit refléter les reçus déjà semés, sinon le premier
    # encaissement réel repart à 000001 et entre en collision.
    await BASE["compteurs"].insert_one(
        {"ecoleId": ecole_id, "nom": "recu", "valeur": len(eleves)}
    )
    await BASE["compteurs"].insert_one(
        {"ecoleId": ecole_id, "nom": "eleve", "valeur": len(eleves)}
    )

    flotte = [
        ("2145CI01", "Toyota Yaris", 2018, 120000, True, 12, -5,
         [("Vidange + filtre à huile", 45000), ("Pneus avant", 50000)]),
        ("3782CI02", "Hyundai i10", 2020, 61200, True, 190, -28,
         [("Plaquettes de frein avant", 68000)]),
        ("5510CI03", "Suzuki Alto", 2021, 39800, True, 280, 225, []),
        ("9034CI04", "Peugeot 208", 2017, 112400, False, 3, 38,
         [("Réparation embrayage", 185000)]),
    ]
    for immat, modele, annee, km, actif, assurance_j, visite_j, entretiens in flotte:
        await BASE["vehicules"].insert_one(
            {
                "id": nouvel_id(), "ecoleId": ecole_id, "immatriculation": immat,
                "modele": modele, "annee": annee, "categorie": "B",
                "kilometrage": km, "actif": actif,
                "assuranceExpire": (date.today() + timedelta(days=assurance_j)).isoformat(),
                "visiteTechniqueExpire": (date.today() + timedelta(days=visite_j)).isoformat(),
                "vignetteExpire": None,
                "entretiens": [
                    {"date": (date.today() - timedelta(days=30 * (i + 1))).isoformat(),
                     "nature": nature, "cout": cout, "kilometrage": km, "note": ""}
                    for i, (nature, cout) in enumerate(entretiens)
                ],
                "creeLe": maintenant(), "modifieLe": maintenant(),
            }
        )

    for categorie, montant, jours in (
        ("Carburant", 85000, 3), ("Salaire moniteur", 240000, 8),
        ("Entretien véhicule", 68000, 15), ("Loyer", 150000, 20),
    ):
        await BASE["depenses"].insert_one(
            {
                "id": nouvel_id(), "ecoleId": ecole_id, "categorie": categorie,
                "montant": montant, "date": (date.today() - timedelta(days=jours)).isoformat(),
                "vehiculeId": "", "note": "", "saisiePar": directeur_id,
                "creeLe": maintenant(), "modifieLe": maintenant(),
            }
        )
    print("Données de démonstration prêtes.")
    print("  Directeur : 0701020304 / demo1234")
    print("  Moniteur  : 0708080808 / demo1234")


if __name__ == "__main__":
    import uvicorn

    from server import creer_app

    asyncio.get_event_loop().run_until_complete(semer())
    uvicorn.run(creer_app(CONFIG), host="127.0.0.1", port=8000, log_level="warning")
