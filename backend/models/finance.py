"""Paiements, échéanciers et dépenses."""
from __future__ import annotations

from datetime import date as Jour

from pydantic import Field

from .communs import (
    Base,
    EntreeBase,
    Montant,
    MoyenPaiement,
    NomCourt,
    Texte,
)


class Paiement(Base):
    eleveId: str
    montant: Montant = Field(gt=0)
    moyen: MoyenPaiement = MoyenPaiement.ESPECES
    date: Jour = Field(default_factory=Jour.today)
    reference: str = Field(default="", max_length=80)   # n° transaction OM/Wave
    numeroRecu: str = Field(default="", max_length=32)  # figé à l'émission
    encaissePar: str = ""                               # id utilisateur
    note: Texte = ""

    # Identifiant d'opération fourni par le client : le serveur ignore une
    # seconde création portant le même. Empêche le double encaissement quand
    # la secrétaire tape deux fois sur « Valider ».
    clientOpId: str = Field(default="", max_length=64)


class PaiementCreation(EntreeBase):
    eleveId: str
    montant: Montant = Field(gt=0)
    moyen: MoyenPaiement = MoyenPaiement.ESPECES
    date: Jour | None = None
    reference: str = Field(default="", max_length=80)
    note: Texte = ""
    clientOpId: str = Field(default="", max_length=64)


class Echeance(EntreeBase):
    """Une ligne du plan de paiement d'un élève."""

    numero: int = Field(ge=1, le=24)
    montant: Montant = Field(gt=0)
    echeance: Jour


class PlanPaiement(Base):
    eleveId: str
    echeances: list[Echeance] = Field(default_factory=list)


class PlanPaiementEntree(EntreeBase):
    eleveId: str
    echeances: list[Echeance]


class Depense(Base):
    categorie: NomCourt          # carburant, salaire, entretien, charges…
    montant: Montant = Field(gt=0)
    date: Jour = Field(default_factory=Jour.today)
    vehiculeId: str = ""
    note: Texte = ""
    saisiePar: str = ""


class DepenseCreation(EntreeBase):
    categorie: NomCourt
    montant: Montant = Field(gt=0)
    date: Jour | None = None
    vehiculeId: str = ""
    note: Texte = ""
