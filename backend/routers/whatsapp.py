"""File WhatsApp : préparation et suivi des messages à envoyer.

La génération est **idempotente** : chaque message porte une clé déterministe,
donc relancer la préparation n'écrit pas deux fois la même relance. C'est
essentiel — un élève relancé trois fois le même jour cesse de lire.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.autorisation import Session, exiger_gestion, exiger_personnel
from lib.db import (
    CONVOCATIONS, ELEVES, MESSAGES, PAIEMENTS, SEANCES, pour_mongo, sans_mongo_id,
)
from lib.depot import filtre, lire_un, lister
from lib.deps import db, session_courante
from lib.journal import journaliser
from lib.metier import progression_eleve, solde_eleve
from models.communs import StatutEleve, StatutSeance, maintenant
from models.message import MessageLibre, MessageWhatsApp, MotifMessage, StatutMessage

routeur = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

# Paliers de relance, en jours écoulés depuis le dernier versement (ou depuis
# l'inscription si l'élève n'a jamais rien versé).
PALIERS_RELANCE = (7, 15, 30)


def _jour(valeur) -> date | None:
    if isinstance(valeur, datetime):
        return valeur.date()
    if isinstance(valeur, date):
        return valeur
    if isinstance(valeur, str):
        try:
            return date.fromisoformat(valeur[:10])
        except ValueError:
            return None
    return None


def _montant(valeur: int) -> str:
    """« 75 000 FCFA » plutôt que « 75000 FCFA » — c'est lu par un élève."""
    return f"{int(valeur or 0):,}".replace(",", " ") + " FCFA"


def _prenom(eleve: dict) -> str:
    return (eleve.get("prenoms") or eleve.get("nom") or "").split(" ")[0]


@routeur.get("")
async def lister_messages(
    statut: StatutMessage | None = Query(default=None),
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> list[dict]:
    exiger_gestion(session)
    messages = await lister(
        base, MESSAGES, session, tri=[("creeLe", -1)], limite=1000,
        **({"statut": statut.value} if statut else {}),
    )
    return messages


@routeur.post("/preparer")
async def preparer(
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Met en file les messages que l'état de l'école justifie aujourd'hui.

    Quatre règles : rappel de séance pour demain, relance d'impayé aux paliers
    7 / 15 / 30 jours, convocation établie à transmettre, félicitations pour
    un permis obtenu.
    """
    exiger_gestion(session)

    eleves = await lister(base, ELEVES, session, limite=5000)
    paiements = await lister(base, PAIEMENTS, session, limite=20000)
    seances = await lister(base, SEANCES, session, limite=20000)
    convocations = await lister(base, CONVOCATIONS, session, limite=5000)
    existants = await lister(base, MESSAGES, session, limite=20000)

    deja = {m.get("cle") for m in existants if m.get("cle")}
    par_id = {e["id"]: e for e in eleves}
    aujourdhui = date.today()
    demain = aujourdhui + timedelta(days=1)

    a_creer: list[MessageWhatsApp] = []

    def ajouter(cle: str, eleve: dict, motif: MotifMessage, texte: str) -> None:
        if cle in deja or not eleve.get("telephone"):
            return
        deja.add(cle)
        a_creer.append(
            MessageWhatsApp(
                ecoleId=session.ecoleId,
                eleveId=eleve["id"],
                destinataire=f"{eleve.get('prenoms', '')} {eleve.get('nom', '')}".strip(),
                telephone=eleve.get("telephone", ""),
                motif=motif,
                texte=texte,
                cle=cle,
            )
        )

    # 1. Rappel des séances de demain.
    for s in seances:
        if s.get("statut") != StatutSeance.PLANIFIEE.value:
            continue
        if _jour(s.get("debut")) != demain:
            continue
        eleve = par_id.get(s.get("eleveId", ""))
        if not eleve:
            continue
        heure = s["debut"].strftime("%H:%M") if isinstance(s.get("debut"), datetime) else ""
        lieu = f" à {s['lieu']}" if s.get("lieu") else ""
        ajouter(
            f"rappel:{s['id']}", eleve, MotifMessage.RAPPEL_SEANCE,
            f"Bonjour {_prenom(eleve)}, rappel de votre séance de conduite demain "
            f"à {heure}{lieu}. Merci d'être ponctuel.",
        )

    # 2. Relance des impayés, par palier.
    versements: dict[str, list[dict]] = {}
    for p in paiements:
        versements.setdefault(p.get("eleveId", ""), []).append(p)

    for e in eleves:
        if e.get("statut") not in (StatutEleve.ACTIF.value, StatutEleve.SUSPENDU.value):
            continue
        solde = solde_eleve(int(e.get("montantTotal", 0)), versements.get(e["id"], []))
        if solde.reste <= 0:
            continue

        dates = [d for d in (_jour(p.get("date")) for p in versements.get(e["id"], [])) if d]
        reference = max(dates) if dates else _jour(e.get("dateInscription")) or aujourdhui
        ecoule = (aujourdhui - reference).days

        # On ne retient que le palier le plus élevé atteint : sinon un élève en
        # retard de 30 jours recevrait trois messages d'un coup.
        atteints = [j for j in PALIERS_RELANCE if ecoule >= j]
        if not atteints:
            continue
        palier = max(atteints)
        ajouter(
            f"impaye:{e['id']}:{palier}", e, MotifMessage.RELANCE_IMPAYE,
            f"Bonjour {_prenom(e)}, il reste {_montant(solde.reste)} à régler pour "
            f"votre formation. Merci de passer à l'auto-école pour régulariser.",
        )

    # 3. Convocations établies, à transmettre.
    for c in convocations:
        eleve = par_id.get(c.get("eleveId", ""))
        if not eleve:
            continue
        ajouter(
            f"convocation:{c['id']}", eleve, MotifMessage.CONVOCATION,
            f"Bonjour {_prenom(eleve)}, votre fiche de présentation à l'examen "
            f"({c.get('reference', '')}) est prête. Passez la retirer à l'auto-école, "
            f"munie de votre pièce d'identité.",
        )

    # 4. Félicitations pour un permis obtenu.
    for e in eleves:
        if e.get("statut") != StatutEleve.DIPLOME.value:
            continue
        ajouter(
            f"felicitations:{e['id']}", e, MotifMessage.FELICITATIONS,
            f"Félicitations {_prenom(e)} pour l'obtention de votre permis ! "
            f"Toute l'équipe vous souhaite bonne route.",
        )

    for message in a_creer:
        await base[MESSAGES].insert_one(pour_mongo(message.model_dump()))

    if a_creer:
        await journaliser(
            base, session, "whatsapp.prepare",
            details=f"{len(a_creer)} message(s) mis en file",
        )

    return {"prepares": len(a_creer), "messages": [m.model_dump() for m in a_creer]}


@routeur.post("", status_code=status.HTTP_201_CREATED)
async def message_libre(
    entree: MessageLibre,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Ajoute un message écrit à la main pour un élève."""
    exiger_gestion(session)
    eleve = await lire_un(base, ELEVES, session, entree.eleveId, "Élève")

    message = MessageWhatsApp(
        ecoleId=session.ecoleId,
        eleveId=eleve["id"],
        destinataire=f"{eleve.get('prenoms', '')} {eleve.get('nom', '')}".strip(),
        telephone=eleve.get("telephone", ""),
        motif=MotifMessage.LIBRE,
        texte=entree.texte,
    )
    await base[MESSAGES].insert_one(pour_mongo(message.model_dump()))
    return message.model_dump()


@routeur.post("/{message_id}/envoye")
async def marquer_envoye(
    message_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Marque un message comme envoyé, après ouverture de WhatsApp.

    C'est une trace déclarative, pas un accusé de réception : l'application ne
    parle pas à WhatsApp. Le dire clairement vaut mieux qu'un faux « livré ».
    """
    exiger_gestion(session)
    message = await lire_un(base, MESSAGES, session, message_id, "Message")

    if message.get("statut") == StatutMessage.ENVOYE.value:
        return message

    await base[MESSAGES].update_one(
        filtre(session, id=message_id),
        {"$set": {
            "statut": StatutMessage.ENVOYE.value,
            "envoyeLe": maintenant(),
            "envoyePar": session.utilisateurId,
            "modifieLe": maintenant(),
        }},
    )
    await journaliser(
        base, session, "whatsapp.envoye", cible_type="message", cible_id=message_id,
        details=f"{message.get('motif')} → {message.get('destinataire')}",
    )
    return await lire_un(base, MESSAGES, session, message_id, "Message")


@routeur.delete("/{message_id}")
async def annuler(
    message_id: str,
    base: Any = Depends(db),
    session: Session = Depends(session_courante),
) -> dict:
    """Retire un message de la file sans l'envoyer."""
    exiger_gestion(session)
    await lire_un(base, MESSAGES, session, message_id, "Message")

    await base[MESSAGES].update_one(
        filtre(session, id=message_id),
        {"$set": {"statut": StatutMessage.ANNULE.value, "modifieLe": maintenant()}},
    )
    return {"annule": message_id}
