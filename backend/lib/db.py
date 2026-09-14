"""Accès MongoDB.

La base est obtenue via `obtenir_db()` et non importée directement : les tests
remplacent la fabrique par une base simulée (`mongomock_motor`), ce qui permet
de tout tester en processus, sans serveur ni réseau.
"""
from __future__ import annotations

from typing import Any, Callable

from .config import Config

# Collections. Ajouter une entité ⇒ l'ajouter ici ET créer ses index.
ECOLES = "ecoles"
UTILISATEURS = "utilisateurs"
ELEVES = "eleves"
PAIEMENTS = "paiements"
PLANS = "plans_paiement"
DEPENSES = "depenses"
SEANCES = "seances"
VEHICULES = "vehicules"
JOURNAL = "journal"
CONVOCATIONS = "convocations"
COMPTEURS = "compteurs"

_fabrique: Callable[[], Any] | None = None


def configurer_db(fabrique: Callable[[], Any]) -> None:
    """Installe la fabrique de base (appelée au démarrage, ou par les tests)."""
    global _fabrique
    _fabrique = fabrique


def obtenir_db() -> Any:
    if _fabrique is None:
        raise RuntimeError(
            "La base n'est pas configurée : appeler configurer_db() au démarrage."
        )
    return _fabrique()


def fabrique_motor(config: Config) -> Callable[[], Any]:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(config.mongo_url)
    base = client[config.db_name]
    return lambda: base


async def creer_index(db: Any) -> None:
    """Index et contraintes d'unicité.

    Chaque index d'unicité est *préfixé par `ecoleId`* : deux auto-écoles
    peuvent avoir un élève avec le même matricule, mais jamais la même école
    deux fois le même. L'unicité globale casserait le cloisonnement.
    """
    await db[UTILISATEURS].create_index([("ecoleId", 1), ("telephone", 1)], unique=True)
    # Le téléphone du personnel est l'identifiant de connexion : il doit
    # être unique globalement, sinon la connexion serait ambiguë.
    await db[UTILISATEURS].create_index([("telephone", 1)], unique=True)
    await db[ELEVES].create_index([("ecoleId", 1), ("matricule", 1)], unique=True)
    await db[ELEVES].create_index([("ecoleId", 1), ("nom", 1)])
    await db[ELEVES].create_index([("portailJeton", 1)], sparse=True)
    await db[PAIEMENTS].create_index([("ecoleId", 1), ("eleveId", 1)])
    await db[PAIEMENTS].create_index(
        [("ecoleId", 1), ("clientOpId", 1)],
        unique=True,
        partialFilterExpression={"clientOpId": {"$gt": ""}},
    )
    await db[PAIEMENTS].create_index(
        [("ecoleId", 1), ("numeroRecu", 1)],
        unique=True,
        partialFilterExpression={"numeroRecu": {"$gt": ""}},
    )
    await db[SEANCES].create_index([("ecoleId", 1), ("debut", 1)])
    await db[SEANCES].create_index([("ecoleId", 1), ("moniteurId", 1), ("debut", 1)])
    await db[SEANCES].create_index([("ecoleId", 1), ("eleveId", 1)])
    await db[VEHICULES].create_index([("ecoleId", 1), ("immatriculation", 1)], unique=True)
    await db[DEPENSES].create_index([("ecoleId", 1), ("date", 1)])
    await db[JOURNAL].create_index([("ecoleId", 1), ("creeLe", -1)])
    await db[CONVOCATIONS].create_index([("ecoleId", 1), ("reference", 1)], unique=True)
    # Une seule fiche par élève et par épreuve : la « vérification » peut être
    # relancée autant de fois qu'on veut sans produire de doublon.
    await db[CONVOCATIONS].create_index(
        [("ecoleId", 1), ("eleveId", 1), ("epreuve", 1)], unique=True
    )


def sans_mongo_id(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Retire `_id`, que Mongo ajoute et qui n'a pas à sortir de l'API."""
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def prochaine_sequence(db: Any, ecole_id: str, nom: str) -> int:
    """Incrémente et retourne un compteur propre à une auto-école.

    Atomique côté Mongo (`$inc` + upsert) : deux secrétaires qui enregistrent
    un paiement au même instant ne peuvent pas obtenir le même numéro de reçu.
    """
    doc = await db[COMPTEURS].find_one_and_update(
        {"ecoleId": ecole_id, "nom": nom},
        {"$inc": {"valeur": 1}},
        upsert=True,
        return_document=True,
    )
    if isinstance(doc, dict) and isinstance(doc.get("valeur"), int):
        return doc["valeur"]
    # Certains pilotes renvoient le document d'avant l'incrément : on relit.
    doc = await db[COMPTEURS].find_one({"ecoleId": ecole_id, "nom": nom})
    return int((doc or {}).get("valeur", 1))


def pour_mongo(valeur: Any) -> Any:
    """Prépare une valeur pour l'écriture : les `date` deviennent des chaînes ISO.

    BSON ne sait encoder que `datetime`, pas `date`. On pourrait convertir en
    `datetime` à minuit, mais tout passage par un fuseau finit par décaler un
    jour — et une date d'échéance décalée d'un jour, c'est une relance envoyée
    au mauvais moment. Une chaîne « AAAA-MM-JJ » est exacte, lisible et se
    trie correctement.
    """
    from datetime import date as _Date
    from datetime import datetime as _DateTime

    if isinstance(valeur, _DateTime):
        return valeur                      # datetime : BSON sait l'encoder
    if isinstance(valeur, _Date):
        return valeur.isoformat()
    if isinstance(valeur, dict):
        return {cle: pour_mongo(v) for cle, v in valeur.items()}
    if isinstance(valeur, (list, tuple)):
        return [pour_mongo(v) for v in valeur]
    return valeur
