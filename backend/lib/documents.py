"""Génération des documents PDF : reçu de paiement, convocation d'examen.

Construit à la main avec ReportLab plutôt qu'à partir d'un gabarit HTML : un
reçu est un document comptable remis à un élève, il doit sortir identique
quelle que soit la machine, sans dépendre d'un navigateur installé.
"""
from __future__ import annotations

import io
from datetime import date, datetime

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas

VERT = HexColor("#0e9f4f")
GRIS = HexColor("#5b6672")
GRIS_PALE = HexColor("#e5e8ec")
NOIR = HexColor("#101828")

LARGEUR, HAUTEUR = A4
MARGE = 20 * mm


def _texte_date(valeur) -> str:
    if isinstance(valeur, datetime):
        valeur = valeur.date()
    if isinstance(valeur, str):
        try:
            valeur = date.fromisoformat(valeur[:10])
        except ValueError:
            return valeur
    if isinstance(valeur, date):
        return valeur.strftime("%d/%m/%Y")
    return "—"


def _montant(valeur: int) -> str:
    """Montant en FCFA, séparateurs par milliers, sans décimale."""
    return f"{int(valeur or 0):,}".replace(",", " ") + " FCFA"


def _entete(c: pdf_canvas.Canvas, ecole: dict, titre: str, sous_titre: str) -> float:
    """Dessine l'en-tête et retourne l'ordonnée où poursuivre."""
    y = HAUTEUR - MARGE

    c.setFillColor(NOIR)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGE, y, (ecole.get("nom") or "Auto-école").upper())

    c.setFont("Helvetica", 8.5)
    c.setFillColor(GRIS)
    details = " · ".join(
        p for p in [
            ecole.get("adresse"),
            ecole.get("commune"),
            f"Tél. {ecole['telephone']}" if ecole.get("telephone") else None,
            f"Agrément {ecole['agrement']}" if ecole.get("agrement") else None,
        ] if p
    )
    if details:
        c.drawString(MARGE, y - 13, details)

    c.setFillColor(VERT)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(LARGEUR - MARGE, y, "GO PERMIS 225")

    y -= 30
    c.setStrokeColor(VERT)
    c.setLineWidth(2)
    c.line(MARGE, y, LARGEUR - MARGE, y)

    y -= 24
    c.setFillColor(NOIR)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGE, y, titre)

    y -= 14
    c.setFont("Helvetica", 9)
    c.setFillColor(GRIS)
    c.drawString(MARGE, y, sous_titre)

    return y - 22


def _ligne(c: pdf_canvas.Canvas, y: float, libelle: str, valeur: str, *, gras=False) -> float:
    c.setFont("Helvetica", 9.5)
    c.setFillColor(GRIS)
    c.drawString(MARGE, y, libelle)

    c.setFont("Helvetica-Bold" if gras else "Helvetica", 10.5 if gras else 9.5)
    c.setFillColor(NOIR)
    c.drawRightString(LARGEUR - MARGE, y, valeur)

    c.setStrokeColor(GRIS_PALE)
    c.setLineWidth(0.5)
    c.line(MARGE, y - 6, LARGEUR - MARGE, y - 6)
    return y - 20


def _pied(c: pdf_canvas.Canvas, mention: str) -> None:
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GRIS)
    c.drawString(MARGE, MARGE, mention)
    c.drawRightString(
        LARGEUR - MARGE, MARGE,
        f"Édité le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
    )


def recu_paiement(*, ecole: dict, eleve: dict, paiement: dict, solde: dict) -> bytes:
    """Reçu d'un versement, à remettre à l'élève."""
    tampon = io.BytesIO()
    c = pdf_canvas.Canvas(tampon, pagesize=A4)
    c.setTitle(f"Reçu {paiement.get('numeroRecu', '')}")

    y = _entete(
        c, ecole, "Reçu de paiement",
        f"N° {paiement.get('numeroRecu', '—')} — {_texte_date(paiement.get('date'))}",
    )

    y = _ligne(c, y, "Élève", f"{eleve.get('prenoms', '')} {eleve.get('nom', '')}".strip())
    y = _ligne(c, y, "Matricule", eleve.get("matricule", "—"))
    y = _ligne(c, y, "Téléphone", eleve.get("telephone", "—"))
    y = _ligne(c, y, "Catégorie", f"Permis {eleve.get('categorie', '—')}")
    y -= 8
    y = _ligne(c, y, "Moyen de paiement", str(paiement.get("moyen", "")).replace("_", " ").title())
    if paiement.get("reference"):
        y = _ligne(c, y, "Référence de transaction", paiement["reference"])
    y = _ligne(c, y, "Montant versé", _montant(paiement.get("montant", 0)), gras=True)

    y -= 10
    c.setFillColor(HexColor("#e9f7ef"))
    c.rect(MARGE, y - 44, LARGEUR - 2 * MARGE, 46, fill=1, stroke=0)
    c.setFillColor(GRIS)
    c.setFont("Helvetica", 9)
    c.drawString(MARGE + 10, y - 14, "Frais de formation")
    c.drawString(MARGE + 10, y - 28, "Total réglé à ce jour")
    c.setFillColor(NOIR)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawRightString(LARGEUR - MARGE - 10, y - 14, _montant(solde.get("montantTotal", 0)))
    c.drawRightString(LARGEUR - MARGE - 10, y - 28, _montant(solde.get("totalPaye", 0)))
    c.setFillColor(VERT)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGE + 10, y - 42, "Reste à payer")
    c.drawRightString(LARGEUR - MARGE - 10, y - 42, _montant(solde.get("reste", 0)))

    y -= 90
    c.setFillColor(GRIS)
    c.setFont("Helvetica", 9)
    c.drawString(MARGE, y, "Signature et cachet de l'auto-école")
    c.setStrokeColor(GRIS_PALE)
    c.rect(MARGE, y - 60, 70 * mm, 54, fill=0, stroke=1)

    _pied(c, "Reçu émis par Go Permis 225 — conserver ce document.")
    c.showPage()
    c.save()
    return tampon.getvalue()


def convocation_examen(*, ecole: dict, eleve: dict, convocation: dict, progression: dict) -> bytes:
    """Fiche de présentation au centre d'examen, à signer par l'auto-école."""
    from models.convocation import LIBELLE_EPREUVE, Epreuve

    tampon = io.BytesIO()
    c = pdf_canvas.Canvas(tampon, pagesize=A4)
    c.setTitle(f"Convocation {convocation.get('reference', '')}")

    try:
        libelle_epreuve = LIBELLE_EPREUVE[Epreuve(convocation.get("epreuve", "conduite"))]
    except ValueError:
        libelle_epreuve = "Examen"

    y = _entete(
        c, ecole, "Fiche de présentation à l'examen",
        f"Réf. {convocation.get('reference', '—')} — {libelle_epreuve}",
    )

    y = _ligne(c, y, "Nom et prénoms", f"{eleve.get('prenoms', '')} {eleve.get('nom', '')}".strip())
    y = _ligne(c, y, "Matricule", eleve.get("matricule", "—"))
    y = _ligne(c, y, "Pièce d'identité (CNI)", eleve.get("cni") or "—")
    y = _ligne(c, y, "Date de naissance", _texte_date(eleve.get("dateNaissance")))
    y = _ligne(c, y, "Commune", eleve.get("commune") or "—")
    y = _ligne(c, y, "Téléphone", eleve.get("telephone", "—"))
    y -= 8
    y = _ligne(c, y, "Catégorie demandée", f"Permis {eleve.get('categorie', '—')}")
    y = _ligne(c, y, "Date d'inscription", _texte_date(eleve.get("dateInscription")))
    y = _ligne(
        c, y, "Heures de conduite effectuées",
        f"{progression.get('heuresConduiteFaites', 0)} h sur {progression.get('heuresConduitePrevues', 0)} h",
    )
    y = _ligne(
        c, y, "Heures de code effectuées",
        f"{progression.get('heuresCodeFaites', 0)} h sur {progression.get('heuresCodePrevues', 0)} h",
    )
    y = _ligne(c, y, "Progression constatée", f"{convocation.get('progression', 0)} %", gras=True)

    y -= 14
    c.setFillColor(GRIS)
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(
        MARGE, y,
        "L'auto-école soussignée atteste que l'élève désigné ci-dessus a suivi la formation",
    )
    c.drawString(MARGE, y - 11, "requise et le présente à l'épreuve mentionnée.")

    y -= 46
    c.setFillColor(GRIS)
    c.setFont("Helvetica", 9)
    c.drawString(MARGE, y, "Le directeur — signature et cachet")
    c.drawString(LARGEUR / 2 + 10, y, "Visa du centre d'examen")
    c.setStrokeColor(GRIS_PALE)
    c.rect(MARGE, y - 62, 75 * mm, 56, fill=0, stroke=1)
    c.rect(LARGEUR / 2 + 10, y - 62, 75 * mm, 56, fill=0, stroke=1)

    _pied(c, "Document établi par Go Permis 225 — à présenter avec une pièce d'identité.")
    c.showPage()
    c.save()
    return tampon.getvalue()
