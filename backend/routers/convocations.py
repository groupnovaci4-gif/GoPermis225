"""Convocations à l'examen : établissement automatique et document PDF."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status

from lib.autorisation import Session, exiger_gestion, exiger_personnel
from lib.db import (
    CONVOCATIONS, ECOLES, ELEVES, SEANCES, pour_mongo, prochaine_sequence, sans_mongo_id,
)
from lib.depot import filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.documents import convocation_examen
from lib.journal import journaliser
from lib.metier import progression_eleve
from models.communs import StatutEleve, maintenant
from models.convocation import Convocation, Epreuve

routeur = APIRouter(prefix="/api/convocations", tags=["convocations"])

# Seuil d'éligibilité : l'élève doit avoir effectué au moins cette part de ses
# heures de conduite. Retenu à 80 % pour que la fiche soit prête avant la fin
# de la formation — le dossier circule, il ne s'établit pas la veille.
SEUIL_ELIGIBILITE = 80


def _progression_conduite(progression) -> int:
    prevu = progression.heuresConduitePrevues
    if prevu <= 0:
        return 100
    return min(100, round(progression.heuresConduiteFaites * 100 / prevu))


@routeur.get("")
async def lister_convocations(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_personnel(session)
    fiches = await lister(base, CONVOCATIONS, session, tri=[("creeLe", -1)], limite=1000)
    return fiches


@routeur.post("/verifier")
async def verifier_eligibles(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Établit les fiches manquantes pour les élèves ayant atteint le seuil.

    Idempotent : un élève déjà convoqué pour cette épreuve n'en reçoit pas une
    seconde. On peut donc relancer la vérification sans précaution.
    """
    exiger_gestion(session)

    eleves = await lister(base, ELEVES, session, limite=5000)
    seances = await lister(base, SEANCES, session, limite=20000)
    existantes = await lister(base, CONVOCATIONS, session, limite=5000)
    deja = {(c.get("eleveId"), c.get("epreuve")) for c in existantes}

    par_eleve: dict[str, list[dict]] = {}
    for s in seances:
        par_eleve.setdefault(s.get("eleveId", ""), []).append(s)

    creees: list[dict] = []
    for e in eleves:
        if e.get("statut") not in (StatutEleve.ACTIF.value,):
            continue
        if (e["id"], Epreuve.CONDUITE.value) in deja:
            continue

        progression = progression_eleve(
            par_eleve.get(e["id"], []),
            code_prevues=int(e.get("heuresCodePrevues", 0)),
            conduite_prevues=int(e.get("heuresConduitePrevues", 0)),
        )
        part = _progression_conduite(progression)
        if part < SEUIL_ELIGIBILITE:
            continue

        suite = await prochaine_sequence(base, session.ecoleId, "convocation")
        fiche = Convocation(
            ecoleId=session.ecoleId,
            eleveId=e["id"],
            reference=f"CGI-{maintenant().year}-{suite:04d}",
            epreuve=Epreuve.CONDUITE,
            progression=part,
            eleveNom=f"{e.get('prenoms', '')} {e.get('nom', '')}".strip(),
            etabliePar=session.utilisateurId,
        )
        await base[CONVOCATIONS].insert_one(pour_mongo(fiche.model_dump()))
        await journaliser(
            base, session, "convocation.etablie",
            cible_type="convocation", cible_id=fiche.id,
            details=f"{fiche.reference} — {fiche.eleveNom} ({part} %)",
        )
        creees.append(fiche.model_dump())

    return {"creees": len(creees), "convocations": creees, "seuil": SEUIL_ELIGIBILITE}


@routeur.get("/{convocation_id}/document")
async def document(
    convocation_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> Response:
    """PDF de la fiche de présentation à l'examen."""
    exiger_personnel(session)

    fiche = await lire_un(base, CONVOCATIONS, session, convocation_id, "Convocation")
    eleve = await lire_un(base, ELEVES, session, fiche["eleveId"], "Élève")
    ecole = sans_mongo_id(await base[ECOLES].find_one({"id": session.ecoleId})) or {}
    seances = await lister(base, SEANCES, session, eleveId=eleve["id"], limite=1000)

    progression = progression_eleve(
        seances,
        code_prevues=int(eleve.get("heuresCodePrevues", 0)),
        conduite_prevues=int(eleve.get("heuresConduitePrevues", 0)),
    )

    contenu = convocation_examen(
        ecole=ecole, eleve=eleve, convocation=fiche, progression=progression.as_dict(),
    )
    return Response(
        content=contenu,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{fiche["reference"]}.pdf"',
        },
    )


@routeur.delete("/{convocation_id}", status_code=status.HTTP_200_OK)
async def annuler(
    convocation_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Retire une fiche établie par erreur — la vérification pourra la refaire."""
    exiger_gestion(session)
    fiche = await lire_un(base, CONVOCATIONS, session, convocation_id, "Convocation")

    await base[CONVOCATIONS].delete_one(filtre(session, id=convocation_id))
    await journaliser(
        base, session, "convocation.annulee",
        cible_type="convocation", cible_id=convocation_id,
        details=fiche.get("reference", ""),
    )
    return {"supprime": convocation_id}
