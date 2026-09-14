"""Convocation au centre d'examen (CGI / OSER).

Une fiche est établie dès qu'un élève atteint le seuil d'heures de conduite.
Elle porte une référence figée à l'émission : c'est un document remis à
l'élève, il ne doit jamais changer de numéro après coup.
"""
from __future__ import annotations

from enum import Enum

from pydantic import Field

from .communs import Base, EntreeBase, NomCourt


class Epreuve(str, Enum):
    CODE = "code"
    CONDUITE = "conduite"


LIBELLE_EPREUVE = {
    Epreuve.CODE: "Code de la route",
    Epreuve.CONDUITE: "Conduite pratique",
}


class Convocation(Base):
    eleveId: str
    reference: str = Field(max_length=32)      # CGI-2026-0001, figé à l'émission
    epreuve: Epreuve = Epreuve.CONDUITE
    # Progression au moment de l'établissement — on garde la valeur constatée,
    # pas la valeur courante : la fiche doit rester fidèle à ce qui a été signé.
    progression: int = Field(default=0, ge=0, le=100)
    eleveNom: NomCourt = ""                    # recopié pour l'affichage en liste
    etabliePar: str = ""


class ConvocationPublique(EntreeBase):
    id: str
    reference: str
    eleveId: str
    eleveNom: str
    epreuve: Epreuve
    progression: int
    creeLe: str
