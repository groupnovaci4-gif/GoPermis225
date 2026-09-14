"""Qui a le droit de faire quoi.

Les garde-fous de l'interface sont cosmétiques : un utilisateur peut toujours
appeler l'API directement. C'est ici — et seulement ici — que l'autorisation
est décidée.

Matrice des rôles :

| Action                                   | directeur | secretaire | moniteur | élève |
|------------------------------------------|-----------|------------|----------|-------|
| Consulter les élèves                      |     X     |      X     |    X*    |  soi  |
| Créer / modifier un élève                 |     X     |      X     |          |       |
| Changer le statut d'un élève              |     X     |      X     |          |       |
| Encaisser un paiement                     |     X     |      X     |          |       |
| Annuler un paiement                       |     X     |            |          |       |
| Créer une séance                          |     X     |      X     |          |       |
| Clôturer SA séance (effectuée / absence)  |     X     |      X     |    X**   |       |
| Gérer le personnel                        |     X     |            |          |       |
| Gérer le parc automobile                  |     X     |      X     |          |       |
| Saisir une dépense                        |     X     |      X     |          |       |
| Réglages de l'école                       |     X     |            |          |       |
| Tableau de bord financier                 |     X     |            |          |       |
| Journal d'audit                           |     X     |            |          |       |

  * le moniteur ne voit que les élèves qu'il forme ;
 ** uniquement ses propres séances.

Le refus est la valeur par défaut : une action non listée est interdite.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from models.communs import Cote, Role


@dataclass(frozen=True)
class Session:
    """Identité vérifiée de l'appelant, reconstruite depuis le jeton."""

    utilisateurId: str
    ecoleId: str
    cote: Cote
    role: Role | None = None
    nom: str = ""

    @property
    def est_eleve(self) -> bool:
        return self.cote is Cote.ELEVE

    @property
    def est_directeur(self) -> bool:
        return self.cote is Cote.ECOLE and self.role is Role.DIRECTEUR

    @property
    def est_moniteur(self) -> bool:
        return self.cote is Cote.ECOLE and self.role is Role.MONITEUR


def interdit(detail: str = "Action non autorisée pour votre rôle.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def introuvable(quoi: str = "Ressource") -> HTTPException:
    # On répond « introuvable » plutôt que « interdit » pour une ressource
    # appartenant à une autre auto-école : un 403 confirmerait son existence.
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail=f"{quoi} introuvable."
    )


# --- Garde-fous réutilisables ---------------------------------------------


def exiger_personnel(session: Session) -> Session:
    if session.cote is not Cote.ECOLE:
        raise interdit("Réservé au personnel de l'auto-école.")
    return session


def exiger_directeur(session: Session) -> Session:
    exiger_personnel(session)
    if session.role is not Role.DIRECTEUR:
        raise interdit("Réservé au directeur.")
    return session


def exiger_gestion(session: Session) -> Session:
    """Directeur ou secrétaire : la gestion courante de l'école."""
    exiger_personnel(session)
    if session.role not in (Role.DIRECTEUR, Role.SECRETAIRE):
        raise interdit("Réservé au directeur et au secrétariat.")
    return session


def peut_cloturer_seance(session: Session, seance_moniteur_id: str) -> bool:
    """Un moniteur ne clôture que ses propres séances."""
    if session.role in (Role.DIRECTEUR, Role.SECRETAIRE):
        return True
    return session.role is Role.MONITEUR and session.utilisateurId == seance_moniteur_id
