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

    directeur_id, moniteur_id = nouvel_id(), nouvel_id()
    for agent in (
        {"id": directeur_id, "nom": "M. Koffi Anzoumana", "telephone": "0701020304",
         "role": "directeur", "tarifHoraire": 0},
        {"id": moniteur_id, "nom": "Yao Kouassi", "telephone": "0708080808",
         "role": "moniteur", "tarifHoraire": 2500},
    ):
        await BASE["utilisateurs"].insert_one(
            {**agent, "ecoleId": ecole_id, "actif": True, "permisEnseigner": "",
             "note": "", "empreinte": hacher_secret("demo1234"),
             "creeLe": maintenant(), "modifieLe": maintenant()}
        )

    eleves = [
        ("Traoré", "Awa", "0555111111", 150000, "actif", 1),
        ("Koné", "Ibrahim", "0555222222", 150000, "actif", 2),
        ("Bamba", "Fatou", "0555333333", 90000, "diplome", 3),
    ]
    for nom, prenoms, tel, montant, statut, index in eleves:
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
        debut = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0) \
            + timedelta(days=index - 1)
        await BASE["seances"].insert_one(
            {
                "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                "moniteurId": moniteur_id, "vehiculeId": "", "type": "conduite",
                "debut": debut, "fin": debut + timedelta(hours=2),
                "statut": "effectuee" if index < 3 else "planifiee",
                "lieu": "Devant l'auto-école", "motif": "", "kilometrage": 0,
                "creePar": directeur_id,
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

    await BASE["vehicules"].insert_one(
        {
            "id": nouvel_id(), "ecoleId": ecole_id, "immatriculation": "1234AB01",
            "modele": "Toyota Corolla", "annee": 2018, "categorie": "B",
            "kilometrage": 145000, "actif": True,
            "assuranceExpire": (date.today() + timedelta(days=12)).isoformat(),
            "visiteTechniqueExpire": (date.today() - timedelta(days=5)).isoformat(),
            "vignetteExpire": None, "entretiens": [],
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
