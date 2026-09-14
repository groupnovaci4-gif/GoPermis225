"""Encaissements et dépenses."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status

from lib.autorisation import Session, exiger_directeur, exiger_gestion, interdit
from lib.db import DEPENSES, ECOLES, ELEVES, PAIEMENTS, pour_mongo, prochaine_sequence, sans_mongo_id
from lib.depot import filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.documents import recu_paiement
from lib.metier import numero_recu, solde_eleve
from models.communs import maintenant
from models.finance import Depense, DepenseCreation, Paiement, PaiementCreation

routeur = APIRouter(prefix="/api", tags=["finances"])


@routeur.post("/paiements", status_code=status.HTTP_201_CREATED)
async def encaisser(
    entree: PaiementCreation,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Enregistre un versement.

    Idempotent : une seconde requête portant le même `clientOpId` renvoie le
    paiement déjà enregistré au lieu d'en créer un second. C'est ce qui évite
    le double encaissement quand le réseau coupe après l'envoi.
    """
    exiger_gestion(session)

    if entree.clientOpId:
        existant = sans_mongo_id(
            await base[PAIEMENTS].find_one(filtre(session, clientOpId=entree.clientOpId))
        )
        if existant is not None:
            return existant

    await lire_un(base, ELEVES, session, entree.eleveId, "Élève")

    ecole = await base[ECOLES].find_one({"id": session.ecoleId}) or {}
    suite = await prochaine_sequence(base, session.ecoleId, "recu")

    paiement = Paiement(
        ecoleId=session.ecoleId,
        eleveId=entree.eleveId,
        montant=entree.montant,
        moyen=entree.moyen,
        date=entree.date or date.today(),
        reference=entree.reference,
        numeroRecu=numero_recu(ecole.get("nom", "GPS"), suite),
        encaissePar=session.utilisateurId,
        note=entree.note,
        clientOpId=entree.clientOpId,
    )
    await base[PAIEMENTS].insert_one(pour_mongo(paiement.model_dump()))
    await journaliser(
        base, session, "paiement.encaisse", cible_type="paiement", cible_id=paiement.id,
        details=f"{paiement.montant} FCFA — {paiement.moyen.value} — reçu {paiement.numeroRecu}",
    )
    return paiement.model_dump()


@routeur.get("/paiements")
async def lister_paiements(
    eleveId: str | None = None,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_gestion(session)
    paiements = await lister(base, PAIEMENTS, session, limite=5000, eleveId=eleveId)

    # Nom de l'élève joint ici : sinon le navigateur devrait charger tout le
    # fichier élèves rien que pour afficher une colonne.
    eleves = await lister(base, ELEVES, session, limite=5000)
    noms = {e["id"]: f"{e.get('prenoms', '')} {e.get('nom', '')}".strip() for e in eleves}
    for p in paiements:
        p["eleveNom"] = noms.get(p.get("eleveId", ""), "")

    return sorted(paiements, key=lambda p: str(p.get("date", "")), reverse=True)


@routeur.get("/paiements/{paiement_id}/recu")
async def recu(
    paiement_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> Response:
    """PDF du reçu, à remettre à l'élève."""
    exiger_gestion(session)

    paiement = await lire_un(base, PAIEMENTS, session, paiement_id, "Paiement")
    eleve = await lire_un(base, ELEVES, session, paiement["eleveId"], "Élève")
    ecole = sans_mongo_id(await base[ECOLES].find_one({"id": session.ecoleId})) or {}
    verses = await lister(base, PAIEMENTS, session, eleveId=eleve["id"], limite=1000)

    contenu = recu_paiement(
        ecole=ecole, eleve=eleve, paiement=paiement,
        solde=solde_eleve(int(eleve.get("montantTotal", 0)), verses).as_dict(),
    )
    return Response(
        content=contenu,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{paiement.get("numeroRecu", "recu")}.pdf"',
        },
    )


@routeur.delete("/paiements/{paiement_id}")
async def annuler_paiement(
    paiement_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Annule un encaissement. Réservé au directeur : c'est une écriture
    comptable, et la secrétaire qui l'a saisie ne doit pas pouvoir l'effacer."""
    exiger_directeur(session)
    paiement = await lire_un(base, PAIEMENTS, session, paiement_id, "Paiement")

    await base[PAIEMENTS].delete_one(filtre(session, id=paiement_id))
    await journaliser(
        base, session, "paiement.annule", cible_type="paiement", cible_id=paiement_id,
        details=f"{paiement.get('montant')} FCFA — reçu {paiement.get('numeroRecu')}",
    )
    return {"supprime": paiement_id}


@routeur.get("/impayes")
async def impayes(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    """Élèves ayant un reste à payer, du plus gros au plus petit."""
    exiger_gestion(session)

    eleves = await lister(base, ELEVES, session, limite=5000)
    paiements = await lister(base, PAIEMENTS, session, limite=20000)

    par_eleve: dict[str, list[dict]] = {}
    for p in paiements:
        par_eleve.setdefault(p.get("eleveId", ""), []).append(p)

    lignes = []
    for e in eleves:
        solde = solde_eleve(int(e.get("montantTotal", 0)), par_eleve.get(e["id"], []))
        if solde.reste <= 0:
            continue
        lignes.append(
            {
                "eleveId": e["id"],
                "matricule": e.get("matricule", ""),
                "nom": e.get("nom", ""),
                "prenoms": e.get("prenoms", ""),
                "telephone": e.get("telephone", ""),
                "statut": e.get("statut", ""),
                **solde.as_dict(),
            }
        )
    return sorted(lignes, key=lambda l: l["reste"], reverse=True)


@routeur.post("/depenses", status_code=status.HTTP_201_CREATED)
async def saisir_depense(
    entree: DepenseCreation,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    exiger_gestion(session)
    depense = Depense(
        ecoleId=session.ecoleId,
        categorie=entree.categorie,
        montant=entree.montant,
        date=entree.date or date.today(),
        vehiculeId=entree.vehiculeId,
        note=entree.note,
        saisiePar=session.utilisateurId,
    )
    await base[DEPENSES].insert_one(pour_mongo(depense.model_dump()))
    await journaliser(
        base, session, "depense.saisie", cible_type="depense", cible_id=depense.id,
        details=f"{depense.categorie} — {depense.montant} FCFA",
    )
    return depense.model_dump()


@routeur.get("/depenses")
async def lister_depenses(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_gestion(session)
    depenses = await lister(base, DEPENSES, session, limite=5000)
    return sorted(depenses, key=lambda d: str(d.get("date", "")), reverse=True)
