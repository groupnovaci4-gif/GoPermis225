"""Types de base partagés par toutes les entités.

Deux conventions structurantes :

1. **Aucun modèle d'entrée ne porte `ecoleId`.** Le serveur le pose lui-même
   depuis le jeton. C'est la garantie anti-IDOR : un client ne peut pas écrire
   dans les données d'une autre auto-école, même en forgeant sa requête.
2. **L'argent est un entier de francs CFA.** Pas de flottant : 0,1 + 0,2 ne
   fait pas 0,3 en binaire, et une comptabilité fausse de un franc est une
   comptabilité fausse.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Montant en francs CFA : entier, jamais négatif.
Montant = Annotated[int, Field(ge=0, le=1_000_000_000)]

NomCourt = Annotated[str, Field(min_length=1, max_length=120)]
Texte = Annotated[str, Field(max_length=2000)]

# Numéros ivoiriens : 10 chiffres (07/05/01…), tolère espaces et +225.
_TELEPHONE = re.compile(r"^(?:\+?225)?[\s.-]?(\d[\s.-]?){10}$")


def nouvel_id() -> str:
    return uuid.uuid4().hex


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


def normaliser_telephone(brut: str) -> str:
    """Ramène un numéro à ses 10 chiffres. Lève ValueError s'il est invalide."""
    if not _TELEPHONE.match(brut or ""):
        raise ValueError(
            "Numéro invalide : 10 chiffres attendus (ex. 07 01 02 03 04)."
        )
    chiffres = re.sub(r"\D", "", brut)
    return chiffres[-10:]


class Base(BaseModel):
    """Socle commun : identifiant, tenant, horodatage de modification."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(default_factory=nouvel_id)
    ecoleId: str
    creeLe: datetime = Field(default_factory=maintenant)
    modifieLe: datetime = Field(default_factory=maintenant)


class EntreeBase(BaseModel):
    """Socle des modèles d'entrée : jamais d'`id` ni d'`ecoleId` côté client."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Role(str, Enum):
    """Rôles du personnel. Le portail élève n'est pas un rôle : c'est un
    autre « côté » de session (voir `Cote`)."""

    DIRECTEUR = "directeur"
    SECRETAIRE = "secretaire"
    MONITEUR = "moniteur"


class Cote(str, Enum):
    ECOLE = "ecole"
    ELEVE = "eleve"


class StatutEleve(str, Enum):
    ACTIF = "actif"
    SUSPENDU = "suspendu"
    DIPLOME = "diplome"
    ABANDON = "abandon"
    RECALE = "recale"


class Categorie(str, Enum):
    """Catégories de permis en Côte d'Ivoire."""

    A = "A"      # motocyclettes
    B = "B"      # véhicules légers
    C = "C"      # poids lourds
    D = "D"      # transport en commun
    E = "E"      # remorques


class MoyenPaiement(str, Enum):
    ESPECES = "especes"
    ORANGE_MONEY = "orange_money"
    WAVE = "wave"
    MTN_MONEY = "mtn_money"
    MOOV_MONEY = "moov_money"
    VIREMENT = "virement"


class TypeSeance(str, Enum):
    CODE = "code"
    CONDUITE = "conduite"


class StatutSeance(str, Enum):
    PLANIFIEE = "planifiee"
    EFFECTUEE = "effectuee"
    ANNULEE = "annulee"
    ABSENT = "absent"


class ResultatExamen(str, Enum):
    EN_ATTENTE = "en_attente"
    ADMIS = "admis"
    AJOURNE = "ajourne"


def valider_date_passee(valeur: date | None, champ: str) -> date | None:
    if valeur is not None and valeur > date.today():
        raise ValueError(f"{champ} ne peut pas être dans le futur.")
    return valeur


class _NormaliseTelephone:
    """Mixin : normalise le champ `telephone` s'il est présent."""

    @field_validator("telephone", check_fields=False)
    @classmethod
    def _tel(cls, v: str | None) -> str | None:
        return normaliser_telephone(v) if v else v
