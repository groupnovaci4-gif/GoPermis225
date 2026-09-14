"""File des messages WhatsApp à envoyer.

L'application ne parle pas à l'API WhatsApp Business — cela demande un compte
Meta, un numéro vérifié et des gabarits approuvés. Elle **prépare** les
messages : destinataire, texte, motif. L'envoi se fait en un clic vers
`wa.me`, et la ligne est marquée envoyée.

Le jour où le compte existe, il n'y a qu'un fournisseur à brancher derrière
`statut = "en_attente"` — rien d'autre à réécrire.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import Field

from .communs import Base, EntreeBase, NomCourt, Texte


class MotifMessage(str, Enum):
    RAPPEL_SEANCE = "rappel_seance"
    RELANCE_IMPAYE = "relance_impaye"
    CONVOCATION = "convocation"
    FELICITATIONS = "felicitations"
    LIEN_PORTAIL = "lien_portail"
    LIBRE = "libre"


LIBELLE_MOTIF = {
    MotifMessage.RAPPEL_SEANCE: "Rappel de séance",
    MotifMessage.RELANCE_IMPAYE: "Relance d'impayé",
    MotifMessage.CONVOCATION: "Convocation à l'examen",
    MotifMessage.FELICITATIONS: "Félicitations",
    MotifMessage.LIEN_PORTAIL: "Lien de suivi",
    MotifMessage.LIBRE: "Message libre",
}


class StatutMessage(str, Enum):
    EN_ATTENTE = "en_attente"
    ENVOYE = "envoye"
    ANNULE = "annule"


class MessageWhatsApp(Base):
    eleveId: str = ""
    destinataire: NomCourt = ""
    telephone: str = Field(default="", max_length=20)
    motif: MotifMessage = MotifMessage.LIBRE
    texte: Texte = ""
    statut: StatutMessage = StatutMessage.EN_ATTENTE
    envoyeLe: datetime | None = None
    envoyePar: str = ""

    # Clé de déduplication, déterministe : « impaye:<eleveId>:15 »,
    # « rappel:<seanceId> »… Deux générations successives ne produisent pas
    # deux fois le même message, et l'élève n'est pas harcelé.
    cle: str = Field(default="", max_length=120)


class MessageLibre(EntreeBase):
    eleveId: str
    texte: Texte = Field(min_length=1)
