"""L'auto-école (le tenant) et son personnel."""
from __future__ import annotations

from pydantic import Field, field_validator

from .communs import (
    Base,
    EntreeBase,
    Montant,
    NomCourt,
    Role,
    Texte,
    _NormaliseTelephone,
    normaliser_telephone,
)


class Ecole(Base):
    nom: NomCourt
    commune: str = Field(default="", max_length=120)
    adresse: str = Field(default="", max_length=300)
    telephone: str = Field(default="", max_length=20)
    agrement: str = Field(default="", max_length=60)
    logoUrl: str = Field(default="", max_length=500)

    # Tarifs par défaut, repris à l'inscription d'un élève. Figés sur la fiche
    # élève au moment de l'inscription : changer le tarif ne doit jamais
    # réécrire le montant dû d'un élève déjà inscrit.
    tarifParCategorie: dict[str, Montant] = Field(default_factory=dict)
    heuresConduiteParDefaut: int = Field(default=20, ge=0, le=200)
    heuresCodeParDefaut: int = Field(default=20, ge=0, le=200)


class EcoleMaj(EntreeBase, _NormaliseTelephone):
    nom: NomCourt | None = None
    commune: str | None = Field(default=None, max_length=120)
    adresse: str | None = Field(default=None, max_length=300)
    telephone: str | None = Field(default=None, max_length=20)
    agrement: str | None = Field(default=None, max_length=60)
    logoUrl: str | None = Field(default=None, max_length=500)
    tarifParCategorie: dict[str, Montant] | None = None
    heuresConduiteParDefaut: int | None = Field(default=None, ge=0, le=200)
    heuresCodeParDefaut: int | None = Field(default=None, ge=0, le=200)


class Utilisateur(Base):
    """Membre du personnel. `empreinte` ne quitte JAMAIS le serveur."""

    nom: NomCourt
    telephone: str = Field(max_length=20)  # sert d'identifiant de connexion
    role: Role
    actif: bool = True
    empreinte: str = Field(default="", exclude=True)

    # Fiche moniteur — renseignée uniquement pour role == moniteur.
    tarifHoraire: Montant = 0
    permisEnseigner: str = Field(default="", max_length=60)
    note: Texte = ""

    @field_validator("telephone")
    @classmethod
    def _tel(cls, v: str) -> str:
        return normaliser_telephone(v)


class UtilisateurPublic(EntreeBase):
    """Ce qu'on renvoie au client : pas d'empreinte, jamais."""

    id: str
    nom: str
    telephone: str
    role: Role
    actif: bool
    tarifHoraire: Montant = 0
    permisEnseigner: str = ""


def en_public(u: Utilisateur) -> UtilisateurPublic:
    return UtilisateurPublic(
        id=u.id,
        nom=u.nom,
        telephone=u.telephone,
        role=u.role,
        actif=u.actif,
        tarifHoraire=u.tarifHoraire,
        permisEnseigner=u.permisEnseigner,
    )


class UtilisateurCreation(EntreeBase, _NormaliseTelephone):
    nom: NomCourt
    telephone: str = Field(max_length=20)
    role: Role
    motDePasse: str = Field(min_length=8, max_length=128)
    tarifHoraire: Montant = 0
    permisEnseigner: str = Field(default="", max_length=60)


class UtilisateurMaj(EntreeBase, _NormaliseTelephone):
    nom: NomCourt | None = None
    telephone: str | None = Field(default=None, max_length=20)
    role: Role | None = None
    actif: bool | None = None
    tarifHoraire: Montant | None = None
    permisEnseigner: str | None = Field(default=None, max_length=60)
    note: Texte | None = None
