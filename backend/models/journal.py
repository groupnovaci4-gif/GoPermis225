"""Journal d'audit : qui a fait quoi, quand.

L'acteur et l'horodatage sont posés par le serveur. Ne jamais les accepter
depuis le client : un journal falsifiable ne vaut rien.
"""
from __future__ import annotations

from pydantic import Field

from .communs import Base, Texte


class EntreeJournal(Base):
    acteurId: str = ""
    acteurNom: str = Field(default="", max_length=120)
    action: str = Field(max_length=80)      # eleve.cree, paiement.encaisse…
    cibleType: str = Field(default="", max_length=40)
    cibleId: str = Field(default="", max_length=64)
    details: Texte = ""
