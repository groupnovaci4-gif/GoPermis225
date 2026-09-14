"""L'élève : dossier, progression, scolarité."""
from __future__ import annotations

from datetime import date

from pydantic import Field, field_validator

from .communs import (
    Base,
    Categorie,
    EntreeBase,
    Montant,
    NomCourt,
    ResultatExamen,
    StatutEleve,
    Texte,
    _NormaliseTelephone,
    maintenant,
    normaliser_telephone,
    valider_date_passee,
)


class ChangementStatut(EntreeBase):
    """Une ligne d'historique. Jamais modifiée, seulement ajoutée."""

    statut: StatutEleve
    motif: Texte = ""
    horodatage: str
    parUtilisateurId: str = ""


class Eleve(Base):
    matricule: str = Field(max_length=32)
    nom: NomCourt
    prenoms: NomCourt
    telephone: str = Field(max_length=20)
    telephoneTuteur: str = Field(default="", max_length=20)
    cni: str = Field(default="", max_length=40)
    dateNaissance: date | None = None
    commune: str = Field(default="", max_length=120)
    photoUrl: str = Field(default="", max_length=500)

    categorie: Categorie = Categorie.B
    statut: StatutEleve = StatutEleve.ACTIF
    dateInscription: date = Field(default_factory=date.today)

    # Montant dû figé à l'inscription : une hausse de tarif ne doit pas
    # réécrire la dette d'un élève déjà inscrit.
    montantTotal: Montant = 0
    heuresCodePrevues: int = Field(default=20, ge=0, le=200)
    heuresConduitePrevues: int = Field(default=20, ge=0, le=200)

    resultatCode: ResultatExamen = ResultatExamen.EN_ATTENTE
    resultatConduite: ResultatExamen = ResultatExamen.EN_ATTENTE
    datePermis: date | None = None

    historiqueStatuts: list[ChangementStatut] = Field(default_factory=list)

    # Jeton du lien unique envoyé par WhatsApp. Renvoyé au personnel une fois
    # (pour construire le lien) mais jamais listé en masse.
    portailJeton: str = Field(default="", exclude=True)

    @field_validator("telephone")
    @classmethod
    def _tel(cls, v: str) -> str:
        return normaliser_telephone(v)

    @field_validator("dateNaissance")
    @classmethod
    def _naissance(cls, v: date | None) -> date | None:
        return valider_date_passee(v, "La date de naissance")


class EleveCreation(EntreeBase, _NormaliseTelephone):
    nom: NomCourt
    prenoms: NomCourt
    telephone: str = Field(max_length=20)
    telephoneTuteur: str = Field(default="", max_length=20)
    cni: str = Field(default="", max_length=40)
    dateNaissance: date | None = None
    commune: str = Field(default="", max_length=120)
    photoUrl: str = Field(default="", max_length=500)
    categorie: Categorie = Categorie.B
    montantTotal: Montant = 0
    heuresCodePrevues: int | None = Field(default=None, ge=0, le=200)
    heuresConduitePrevues: int | None = Field(default=None, ge=0, le=200)


class EleveMaj(EntreeBase, _NormaliseTelephone):
    nom: NomCourt | None = None
    prenoms: NomCourt | None = None
    telephone: str | None = Field(default=None, max_length=20)
    telephoneTuteur: str | None = Field(default=None, max_length=20)
    cni: str | None = Field(default=None, max_length=40)
    dateNaissance: date | None = None
    commune: str | None = Field(default=None, max_length=120)
    photoUrl: str | None = Field(default=None, max_length=500)
    categorie: Categorie | None = None
    montantTotal: Montant | None = None
    heuresCodePrevues: int | None = Field(default=None, ge=0, le=200)
    heuresConduitePrevues: int | None = Field(default=None, ge=0, le=200)
    resultatCode: ResultatExamen | None = None
    resultatConduite: ResultatExamen | None = None
    datePermis: date | None = None


class ChangementStatutEntree(EntreeBase):
    statut: StatutEleve
    motif: Texte = ""
