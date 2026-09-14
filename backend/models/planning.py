"""Séances de code et de conduite."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, model_validator

from .communs import (
    Base,
    EntreeBase,
    StatutSeance,
    Texte,
    TypeSeance,
)


class Seance(Base):
    eleveId: str
    moniteurId: str
    vehiculeId: str = ""
    type: TypeSeance = TypeSeance.CONDUITE
    debut: datetime
    fin: datetime
    statut: StatutSeance = StatutSeance.PLANIFIEE
    lieu: str = Field(default="", max_length=160)
    motif: Texte = ""            # renseigné si annulée ou absence
    kilometrage: int = Field(default=0, ge=0)
    creePar: str = ""

    @property
    def duree_minutes(self) -> int:
        return max(0, int((self.fin - self.debut).total_seconds() // 60))

    @model_validator(mode="after")
    def _coherence(self) -> "Seance":
        if self.fin <= self.debut:
            raise ValueError("La fin de la séance doit suivre son début.")
        if (self.fin - self.debut).total_seconds() > 8 * 3600:
            raise ValueError("Une séance ne peut pas dépasser 8 heures.")
        return self


class SeanceCreation(EntreeBase):
    eleveId: str
    moniteurId: str
    vehiculeId: str = ""
    type: TypeSeance = TypeSeance.CONDUITE
    debut: datetime
    fin: datetime
    lieu: str = Field(default="", max_length=160)

    @model_validator(mode="after")
    def _coherence(self) -> "SeanceCreation":
        if self.fin <= self.debut:
            raise ValueError("La fin de la séance doit suivre son début.")
        return self


class SeanceMaj(EntreeBase):
    statut: StatutSeance | None = None
    motif: Texte | None = None
    kilometrage: int | None = Field(default=None, ge=0)
    vehiculeId: str | None = None
    debut: datetime | None = None
    fin: datetime | None = None
    lieu: str | None = Field(default=None, max_length=160)
