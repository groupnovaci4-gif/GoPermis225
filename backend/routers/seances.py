"""Planning : création de séances, détection de conflits, clôture."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.autorisation import (
    Session,
    exiger_gestion,
    exiger_personnel,
    interdit,
    peut_cloturer_seance,
)
from lib.db import ELEVES, SEANCES, UTILISATEURS, VEHICULES, pour_mongo
from lib.depot import champs_modifies, filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.metier import conflits_seance
from models.communs import Role, StatutSeance, maintenant
from models.planning import Seance, SeanceCreation, SeanceMaj

routeur = APIRouter(prefix="/api/seances", tags=["planning"])


async def _seances_de_la_fenetre(
    base: Any, session: Session, debut: datetime, fin: datetime
) -> list[dict]:
    """Séances susceptibles de chevaucher le créneau visé.

    On élargit d'un jour de chaque côté : suffisant puisqu'une séance ne peut
    pas dépasser 8 heures, et bien plus économe que charger tout le planning.
    """
    curseur = base[SEANCES].find(
        filtre(
            session,
            **{"debut": {"$gte": debut - timedelta(days=1), "$lte": fin + timedelta(days=1)}},
        )
    )
    documents = await curseur.to_list(length=2000)
    for d in documents:
        d.pop("_id", None)
    return documents


@routeur.get("")
async def lister_seances(
    du: datetime | None = Query(default=None),
    au: datetime | None = Query(default=None),
    moniteurId: str | None = None,
    eleveId: str | None = None,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_personnel(session)

    # Un moniteur ne voit que son propre planning.
    if session.role is Role.MONITEUR:
        moniteurId = session.utilisateurId

    conditions: dict[str, Any] = {}
    if du or au:
        borne: dict[str, Any] = {}
        if du:
            borne["$gte"] = du
        if au:
            borne["$lte"] = au
        conditions["debut"] = borne

    curseur = base[SEANCES].find(
        filtre(session, moniteurId=moniteurId, eleveId=eleveId, **conditions)
    )
    documents = await curseur.to_list(length=3000)
    for d in documents:
        d.pop("_id", None)
    return sorted(documents, key=lambda s: s.get("debut") or maintenant())


@routeur.post("", status_code=status.HTTP_201_CREATED)
async def creer_seance(
    entree: SeanceCreation,
    forcer: bool = Query(default=False, description="Créer malgré un conflit détecté"),
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Crée une séance après vérification des conflits moniteur / véhicule."""
    exiger_gestion(session)

    await lire_un(base, ELEVES, session, entree.eleveId, "Élève")
    moniteur = await lire_un(base, UTILISATEURS, session, entree.moniteurId, "Moniteur")
    if moniteur.get("role") != Role.MONITEUR.value:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La séance doit être affectée à un moniteur.",
        )
    if entree.vehiculeId:
        vehicule = await lire_un(base, VEHICULES, session, entree.vehiculeId, "Véhicule")
        if not vehicule.get("actif", True):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce véhicule est hors service."
            )

    existantes = await _seances_de_la_fenetre(base, session, entree.debut, entree.fin)
    conflits = conflits_seance(
        debut=entree.debut,
        fin=entree.fin,
        moniteur_id=entree.moniteurId,
        vehicule_id=entree.vehiculeId,
        existantes=existantes,
    )
    if conflits and not forcer:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Ce créneau est déjà occupé.",
                "conflits": [
                    {
                        "id": c["id"],
                        "motif": c["motif"],
                        "debut": c["debut"].isoformat(),
                        "fin": c["fin"].isoformat(),
                    }
                    for c in conflits
                ],
            },
        )

    seance = Seance(
        ecoleId=session.ecoleId,
        eleveId=entree.eleveId,
        moniteurId=entree.moniteurId,
        vehiculeId=entree.vehiculeId,
        type=entree.type,
        debut=entree.debut,
        fin=entree.fin,
        lieu=entree.lieu,
        creePar=session.utilisateurId,
    )
    await base[SEANCES].insert_one(pour_mongo(seance.model_dump()))
    await journaliser(
        base, session, "seance.creee", cible_type="seance", cible_id=seance.id,
        details=f"{seance.type.value} — {seance.debut.isoformat()}",
    )
    return seance.model_dump()


@routeur.patch("/{seance_id}")
async def modifier_seance(
    seance_id: str,
    maj: SeanceMaj,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Clôture ou ajuste une séance.

    Un moniteur peut clôturer **ses** séances (effectuée / absence) et rien
    d'autre : déplacer un créneau ou changer de véhicule reste au secrétariat.
    """
    exiger_personnel(session)
    seance = await lire_un(base, SEANCES, session, seance_id, "Séance")

    if not peut_cloturer_seance(session, seance.get("moniteurId", "")):
        raise interdit("Vous ne pouvez modifier que vos propres séances.")

    modifications = champs_modifies(maj)
    if not modifications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucune modification fournie.")

    if session.role is Role.MONITEUR:
        autorises = {"statut", "motif", "kilometrage"}
        interdits = set(modifications) - autorises
        if interdits:
            raise interdit(
                "Un moniteur ne peut modifier que le statut, le motif et le kilométrage."
            )

    # Déplacer une séance impose de revérifier les conflits.
    if "debut" in modifications or "fin" in modifications or "vehiculeId" in modifications:
        debut = modifications.get("debut", seance.get("debut"))
        fin = modifications.get("fin", seance.get("fin"))
        if not isinstance(debut, datetime) or not isinstance(fin, datetime) or fin <= debut:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "La fin de la séance doit suivre son début.",
            )
        existantes = await _seances_de_la_fenetre(base, session, debut, fin)
        conflits = conflits_seance(
            debut=debut,
            fin=fin,
            moniteur_id=modifications.get("moniteurId", seance.get("moniteurId", "")),
            vehicule_id=modifications.get("vehiculeId", seance.get("vehiculeId", "")),
            existantes=existantes,
            ignorer_id=seance_id,
        )
        if conflits:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ce créneau est déjà occupé.")

    # Une absence ou une annulation sans motif est ingérable en litige.
    statut = modifications.get("statut")
    if statut in (StatutSeance.ANNULEE.value, StatutSeance.ABSENT.value):
        motif = modifications.get("motif", seance.get("motif", ""))
        if not str(motif).strip():
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Un motif est obligatoire pour une annulation ou une absence.",
            )

    modifications["modifieLe"] = maintenant()
    await base[SEANCES].update_one(filtre(session, id=seance_id), {"$set": pour_mongo(modifications)})
    await journaliser(
        base, session, "seance.modifiee", cible_type="seance", cible_id=seance_id,
        details=", ".join(sorted(k for k in modifications if k != "modifieLe")),
    )
    return await lire_un(base, SEANCES, session, seance_id, "Séance")


@routeur.delete("/{seance_id}")
async def supprimer_seance(
    seance_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Supprime une séance encore planifiée.

    Une séance déjà effectuée n'est pas supprimable : elle porte des heures
    comptées dans la progression de l'élève et dans le salaire du moniteur.
    On l'annule avec un motif, ce qui laisse une trace.
    """
    exiger_gestion(session)
    seance = await lire_un(base, SEANCES, session, seance_id, "Séance")

    if seance.get("statut") == StatutSeance.EFFECTUEE.value:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Une séance effectuée ne se supprime pas : annulez-la avec un motif.",
        )

    await base[SEANCES].delete_one(filtre(session, id=seance_id))
    await journaliser(
        base, session, "seance.supprimee", cible_type="seance", cible_id=seance_id
    )
    return {"supprime": seance_id}
