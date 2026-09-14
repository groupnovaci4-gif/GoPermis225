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
    """Jeu de données de démonstration, assez fourni pour un vrai essai.

    Les dates sont relatives à aujourd'hui : les indicateurs « du mois », la
    courbe sur douze mois, les paliers de relance et les alertes de flotte ont
    donc toujours quelque chose à montrer, quel que soit le jour où la démo
    est lancée.
    """
    # Identifiants FIXES, et non tirés au hasard.
    #
    # La base est en mémoire : chaque redémarrage la recrée. Avec des
    # identifiants aléatoires, le jeton gardé par le navigateur désignait une
    # auto-école qui n'existait plus — l'application s'affichait connectée mais
    # entièrement vide, et le serveur avait raison de ne rien montrer. Des
    # identifiants stables font survivre la session aux redémarrages.
    ecole_id = "demo0000ecole0000laureussite0001"
    await BASE["ecoles"].insert_one(
        {
            "id": ecole_id, "ecoleId": ecole_id, "nom": "Auto-École La Réussite",
            "commune": "Yopougon", "telephone": "0707070707",
            "adresse": "Sicogi, face à la pharmacie du Marché", "agrement": "AG-2026-118",
            "logoUrl": "",
            "tarifParCategorie": {"A": 90000, "B": 150000, "C": 250000},
            "heuresCodeParDefaut": 20, "heuresConduiteParDefaut": 20,
            "creeLe": maintenant(), "modifieLe": maintenant(),
        }
    )

    directeur_id = "demo0000directeur0000koffi000001"
    moniteurs = [
        {"id": "demo0000moniteur00000yao0000001", "nom": "Yao Kouassi",
         "telephone": "0708080808", "role": "moniteur", "tarifHoraire": 2500,
         "permisEnseigner": "MON-CI-4023"},
        {"id": "demo0000moniteur00000aya0000002", "nom": "Aya Bernadette",
         "telephone": "0709090909", "role": "moniteur", "tarifHoraire": 2200,
         "permisEnseigner": "MON-CI-4412"},
        {"id": "demo0000moniteur00000bamba00003", "nom": "Bamba Seydou",
         "telephone": "0710101010", "role": "moniteur", "tarifHoraire": 2800,
         "permisEnseigner": "MON-CI-5178"},
    ]
    for agent in [
        {"id": directeur_id, "nom": "M. Koffi Anzoumana", "telephone": "0701020304",
         "role": "directeur", "tarifHoraire": 0, "permisEnseigner": ""},
        {"id": "demo0000secretaire0000adjoua01", "nom": "Adjoua Konan",
         "telephone": "0505050505", "role": "secretaire", "tarifHoraire": 0,
         "permisEnseigner": ""},
        *moniteurs,
    ]:
        await BASE["utilisateurs"].insert_one(
            {**agent, "ecoleId": ecole_id, "actif": True, "note": "",
             "empreinte": hacher_secret("demo1234"),
             "creeLe": maintenant(), "modifieLe": maintenant()}
        )

    # (nom, prénoms, tél, commune, catégorie, frais, statut, heures faites,
    #  part réglée, jours depuis le dernier versement, mois depuis inscription)
    eleves = [
        ("Traoré", "Awa", "0555111111", "Yopougon", "B", 150000, "actif", 4, 0.50, 3, 2),
        ("Koné", "Ibrahim", "0555222222", "Abobo", "B", 150000, "actif", 20, 1.00, 5, 5),
        ("Bamba", "Fatou", "0555333333", "Cocody", "B", 150000, "diplome", 20, 1.00, 60, 8),
        ("N'Guessan", "Serge", "0555444444", "Cocody", "B", 150000, "actif", 18, 1.00, 12, 6),
        ("Diomandé", "Mariam", "0555555555", "Koumassi", "B", 150000, "actif", 11, 0.50, 9, 4),
        ("Yapo", "Nadège", "0555666666", "Plateau", "C", 250000, "actif", 2, 0.30, 35, 1),
        ("Gbagbo", "Arsène", "0555777777", "Marcory", "B", 150000, "suspendu", 8, 0.40, 48, 5),
        ("Assi", "Emmanuel", "0555888888", "Treichville", "B", 150000, "abandon", 3, 0.80, 95, 9),
        ("Kouadio", "Brou", "0555999999", "Cocody", "B", 150000, "actif", 6, 0.60, 16, 3),
        ("Coulibaly", "Ibrahim", "0556000111", "Plateau", "A", 90000, "actif", 0, 0.00, 20, 1),
        ("Sangaré", "Rokia", "0556000222", "Abobo", "C", 250000, "actif", 1, 0.20, 40, 2),
        ("Touré", "Aminata", "0556000333", "Yopougon", "B", 150000, "actif", 14, 0.70, 6, 4),
        ("Bakayoko", "Lassina", "0556000444", "Abobo", "B", 150000, "actif", 14, 0.20, 25, 3),
        ("Konan", "Adjoua", "0556000555", "Treichville", "B", 150000, "diplome", 20, 1.00, 75, 10),
        ("Kone", "Fatoumata", "0556000666", "Yopougon", "A", 90000, "recale", 20, 1.00, 50, 7),
    ]

    base_jour = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    suite_recu = 0
    suite_eleve = 0
    identifiants: list[tuple[str, str]] = []

    for (nom, prenoms, tel, commune, categorie, frais, statut, heures,
         part_reglee, jours_dernier, mois_inscription) in eleves:
        suite_eleve += 1
        eleve_id = f"demo0000eleve000000000000000{suite_eleve:04d}"
        identifiants.append((eleve_id, f"{prenoms} {nom}"))
        inscription = date.today() - timedelta(days=30 * mois_inscription)

        await BASE["eleves"].insert_one(
            {
                "id": eleve_id, "ecoleId": ecole_id,
                "matricule": f"GP-{date.today().year}-{suite_eleve:04d}",
                "nom": nom, "prenoms": prenoms, "telephone": tel, "telephoneTuteur": "",
                "cni": f"CI{suite_eleve:06d}83", "dateNaissance": None,
                "commune": commune, "photoUrl": "",
                "categorie": categorie, "statut": statut,
                "dateInscription": inscription.isoformat(),
                "montantTotal": frais, "heuresCodePrevues": 20,
                "heuresConduitePrevues": 20,
                "resultatCode": "admis" if statut in ("diplome", "recale") else "en_attente",
                "resultatConduite": (
                    "admis" if statut == "diplome"
                    else "ajourne" if statut == "recale" else "en_attente"
                ),
                "datePermis": None, "historiqueStatuts": [],
                "portailJeton": jeton_opaque(),
                "creeLe": maintenant(), "modifieLe": maintenant(),
            }
        )

        # Versements étalés dans le temps : la courbe sur douze mois et les
        # paliers de relance ont besoin d'un historique, pas d'un seul montant.
        a_regler = round(frais * part_reglee)
        if a_regler > 0:
            tranches = max(1, min(4, round(a_regler / 40000)))
            unite = a_regler // tranches
            for t in range(tranches):
                dernier = t == tranches - 1
                montant = a_regler - unite * (tranches - 1) if dernier else unite
                jours = jours_dernier if dernier else jours_dernier + 30 * (tranches - t - 1)
                suite_recu += 1
                await BASE["paiements"].insert_one(
                    {
                        "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                        "montant": montant,
                        "moyen": ["especes", "orange_money", "wave", "mtn_money"][t % 4],
                        "date": (date.today() - timedelta(days=jours)).isoformat(),
                        "reference": f"TX{suite_recu:08d}" if t % 4 else "",
                        "numeroRecu": f"REC-AUT-{suite_recu:06d}",
                        "encaissePar": directeur_id, "note": "",
                        "clientOpId": f"demo-{eleve_id}-{t}",
                        "creeLe": maintenant(), "modifieLe": maintenant(),
                    }
                )

        moniteur = moniteurs[suite_eleve % len(moniteurs)]
        for h in range(heures):
            debut = base_jour - timedelta(days=h * 3 + 2, hours=suite_eleve % 5)
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

        for h in range(min(20, heures)):
            debut = base_jour - timedelta(days=h * 3 + 1, hours=(suite_eleve + 2) % 6)
            await BASE["seances"].insert_one(
                {
                    "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                    "moniteurId": moniteur["id"], "vehiculeId": "", "type": "code",
                    "debut": debut, "fin": debut + timedelta(hours=1),
                    "statut": "effectuee", "lieu": "Salle de code",
                    "motif": "", "kilometrage": 0, "creePar": directeur_id,
                    "creeLe": maintenant(), "modifieLe": maintenant(),
                }
            )

        # Séances à venir : le planning de la semaine et les rappels WhatsApp
        # du lendemain ont besoin de créneaux futurs.
        if statut == "actif":
            for n in range(2):
                prochain = base_jour + timedelta(
                    days=(suite_eleve + n) % 6 + 1, hours=(suite_eleve + n) % 8
                )
                await BASE["seances"].insert_one(
                    {
                        "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                        "moniteurId": moniteurs[(suite_eleve + n) % len(moniteurs)]["id"],
                        "vehiculeId": "", "type": "conduite" if n == 0 else "code",
                        "debut": prochain, "fin": prochain + timedelta(hours=1),
                        "statut": "planifiee", "lieu": "Rond-point de la Sicogi",
                        "motif": "", "kilometrage": 0, "creePar": directeur_id,
                        "creeLe": maintenant(), "modifieLe": maintenant(),
                    }
                )

    await BASE["compteurs"].insert_one(
        {"ecoleId": ecole_id, "nom": "recu", "valeur": suite_recu}
    )
    await BASE["compteurs"].insert_one(
        {"ecoleId": ecole_id, "nom": "eleve", "valeur": suite_eleve}
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

    # Dépenses sur plusieurs mois : le résultat du mois et l'historique tiennent
    # debout tous les deux.
    for mois in range(5):
        for categorie, montant in (
            ("Carburant", 85000 + 5000 * mois), ("Salaire moniteur", 240000),
            ("Entretien véhicule", 68000 if mois % 2 else 0), ("Loyer", 150000),
            ("Électricité", 32000),
        ):
            if montant == 0:
                continue
            await BASE["depenses"].insert_one(
                {
                    "id": nouvel_id(), "ecoleId": ecole_id, "categorie": categorie,
                    "montant": montant,
                    "date": (date.today() - timedelta(days=30 * mois + 5)).isoformat(),
                    "vehiculeId": "", "note": "", "saisiePar": directeur_id,
                    "creeLe": maintenant(), "modifieLe": maintenant(),
                }
            )

    # --- Convocations déjà établies -------------------------------------
    suite_convocation = 0
    convocations: list[tuple[str, str, str]] = []  # (id, référence, nom)
    for (eleve_id, nom_complet), ligne in zip(identifiants, eleves):
        statut, heures = ligne[6], ligne[7]
        if statut != "actif":
            continue
        part = min(100, round(heures * 100 / 20))
        if part < 80:
            continue
        suite_convocation += 1
        convocation_id = nouvel_id()
        reference = f"CGI-{date.today().year}-{suite_convocation:04d}"
        convocations.append((convocation_id, reference, nom_complet))
        await BASE["convocations"].insert_one(
            {
                "id": convocation_id, "ecoleId": ecole_id, "eleveId": eleve_id,
                "reference": reference, "epreuve": "conduite", "progression": part,
                "eleveNom": nom_complet, "etabliePar": directeur_id,
                "creeLe": maintenant() - timedelta(days=2),
                "modifieLe": maintenant() - timedelta(days=2),
            }
        )
    await BASE["compteurs"].insert_one(
        {"ecoleId": ecole_id, "nom": "convocation", "valeur": suite_convocation}
    )

    # --- File WhatsApp déjà peuplée --------------------------------------
    par_nom = {nom: (identifiant, ligne)
               for (identifiant, nom), ligne in zip(identifiants, eleves)}

    async def message(eleve_id, nom, telephone, motif, texte, cle, statut, jours):
        await BASE["messages"].insert_one(
            {
                "id": nouvel_id(), "ecoleId": ecole_id, "eleveId": eleve_id,
                "destinataire": nom, "telephone": telephone, "motif": motif,
                "texte": texte, "statut": statut, "cle": cle,
                "envoyeLe": (maintenant() - timedelta(days=jours)) if statut == "envoye" else None,
                "envoyePar": directeur_id if statut == "envoye" else "",
                "creeLe": maintenant() - timedelta(days=jours),
                "modifieLe": maintenant() - timedelta(days=jours),
            }
        )

    # Déjà envoyés : les félicitations des diplômés.
    for nom_complet, (eleve_id, ligne) in par_nom.items():
        if ligne[6] != "diplome":
            continue
        prenom = nom_complet.split(" ")[0]
        await message(
            eleve_id, nom_complet, ligne[2], "felicitations",
            f"Félicitations {prenom} pour l'obtention de votre permis ! "
            f"Toute l'équipe vous souhaite bonne route.",
            f"felicitations:{eleve_id}", "envoye", 4,
        )

    # En attente : les convocations à transmettre.
    for convocation_id, reference, nom_complet in convocations:
        eleve_id, ligne = par_nom[nom_complet]
        prenom = nom_complet.split(" ")[0]
        await message(
            eleve_id, nom_complet, ligne[2], "convocation",
            f"Bonjour {prenom}, votre fiche de présentation à l'examen ({reference}) "
            f"est prête. Passez la retirer à l'auto-école, munie de votre pièce "
            f"d'identité.",
            f"convocation:{convocation_id}", "en_attente", 2,
        )

    total_eleves = len(eleves)
    print("Données de démonstration prêtes :")
    print(f"  {total_eleves} élèves · {len(moniteurs)} moniteurs · {len(flotte)} véhicules")
    print(f"  {suite_recu} encaissements étalés sur plusieurs mois")
    print(f"  {suite_convocation} convocations établies · file WhatsApp amorcée")
    print("  Directeur : 0701020304 / demo1234")
    print("  Moniteur  : 0708080808 / demo1234")


if __name__ == "__main__":
    import os

    import uvicorn

    from server import creer_app

    # 0.0.0.0 et non 127.0.0.1 : dans un conteneur, un aperçu d'hébergeur se
    # connecte depuis l'extérieur de la boucle locale. N'écouter que sur
    # 127.0.0.1 donne un « connexion refusée » alors que le serveur tourne.
    hote = os.environ.get("HOTE", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))

    asyncio.get_event_loop().run_until_complete(semer())
    print(f"\nServeur de démonstration sur http://{hote}:{port}")
    print("Base EN MÉMOIRE et secret fixe : démonstration uniquement.\n")
    uvicorn.run(creer_app(CONFIG), host=hote, port=port, log_level="warning")
