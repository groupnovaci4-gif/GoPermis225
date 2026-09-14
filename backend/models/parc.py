"""Parc automobile : véhicules, échéances administratives, entretien."""
from __future__ import annotations

from datetime import date as Jour

from pydantic import Field

from .communs import Base, EntreeBase, Montant, NomCourt, Texte


class Entretien(EntreeBase):
    date: Jour
    nature: NomCourt          # vidange, pneus, réparation…
    cout: Montant = 0
    kilometrage: int = Field(default=0, ge=0)
    note: Texte = ""


class Vehicule(Base):
    immatriculation: str = Field(min_length=2, max_length=24)
    modele: NomCourt
    annee: int = Field(default=0, ge=0, le=2100)
    categorie: str = Field(default="B", max_length=4)
    kilometrage: int = Field(default=0, ge=0)
    actif: bool = True

    assuranceExpire: Jour | None = None
    visiteTechniqueExpire: Jour | None = None
    vignetteExpire: Jour | None = None

    entretiens: list[Entretien] = Field(default_factory=list)


class VehiculeCreation(EntreeBase):
    immatriculation: str = Field(min_length=2, max_length=24)
    modele: NomCourt
    annee: int = Field(default=0, ge=0, le=2100)
    categorie: str = Field(default="B", max_length=4)
    kilometrage: int = Field(default=0, ge=0)
    assuranceExpire: Jour | None = None
    visiteTechniqueExpire: Jour | None = None
    vignetteExpire: Jour | None = None


class VehiculeMaj(EntreeBase):
    immatriculation: str | None = Field(default=None, min_length=2, max_length=24)
    modele: NomCourt | None = None
    annee: int | None = Field(default=None, ge=0, le=2100)
    categorie: str | None = Field(default=None, max_length=4)
    kilometrage: int | None = Field(default=None, ge=0)
    actif: bool | None = None
    assuranceExpire: Jour | None = None
    visiteTechniqueExpire: Jour | None = None
    vignetteExpire: Jour | None = None
