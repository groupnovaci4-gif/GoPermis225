"""Règles de calcul du domaine — module pur, sans base ni réseau.

Tout ce qui touche à l'argent ou à la progression d'un élève est calculé ici,
à partir des enregistrements bruts. Aucun total n'est stocké : un cumul stocké
finit toujours par diverger de la réalité qu'il résume.

Invariants :
  1. Le reste à payer n'est jamais négatif. Un trop-perçu est signalé à part,
     pas masqué par un `max(0)` silencieux.
  2. Seules les séances `effectuee` comptent comme heures réalisées. Une
     séance planifiée n'est pas une séance faite ; une absence non plus.
  3. Deux séances sont en conflit si elles se chevauchent pour le **même
     moniteur** ou le **même véhicule**. Une séance annulée ne bloque rien.
  4. Le salaire d'un moniteur porte sur ses heures `effectuee` uniquement.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from models.communs import StatutEleve, StatutSeance, TypeSeance

# Une « heure de conduite » facturée dure 60 minutes.
MINUTES_PAR_HEURE = 60


# ---------------------------------------------------------------------------
# Argent
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SoldeEleve:
    montantTotal: int
    totalPaye: int
    reste: int
    tropPercu: int
    tauxRecouvrement: int  # pourcentage entier, 0–100

    def as_dict(self) -> dict[str, int]:
        return {
            "montantTotal": self.montantTotal,
            "totalPaye": self.totalPaye,
            "reste": self.reste,
            "tropPercu": self.tropPercu,
            "tauxRecouvrement": self.tauxRecouvrement,
        }


def solde_eleve(montant_total: int, paiements: Iterable[dict]) -> SoldeEleve:
    """Solde d'un élève à partir de son dû et de ses versements."""
    total_paye = sum(int(p.get("montant", 0)) for p in paiements)
    ecart = montant_total - total_paye
    reste = max(0, ecart)
    trop_percu = max(0, -ecart)
    taux = 100 if montant_total <= 0 else min(100, round(total_paye * 100 / montant_total))
    return SoldeEleve(
        montantTotal=montant_total,
        totalPaye=total_paye,
        reste=reste,
        tropPercu=trop_percu,
        tauxRecouvrement=int(taux),
    )


def numero_recu(prefixe: str, sequence: int) -> str:
    """Numéro de reçu figé à l'émission : `REC-<PREFIXE>-000123`.

    Le préfixe est dérivé de l'auto-école, la séquence lui est propre. Le
    numéro est stocké sur le paiement : on ne le recalcule jamais à
    l'affichage, sinon une suppression décalerait tous les reçus déjà remis.
    """
    tag = "".join(c for c in prefixe.upper() if c.isalnum())[:3] or "GPS"
    return f"REC-{tag}-{max(0, sequence):06d}"


# ---------------------------------------------------------------------------
# Progression pédagogique
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Progression:
    heuresCodeFaites: int
    heuresConduiteFaites: int
    heuresCodePrevues: int
    heuresConduitePrevues: int
    pourcentage: int
    pretPourExamen: bool

    def as_dict(self) -> dict[str, int | bool]:
        return {
            "heuresCodeFaites": self.heuresCodeFaites,
            "heuresConduiteFaites": self.heuresConduiteFaites,
            "heuresCodePrevues": self.heuresCodePrevues,
            "heuresConduitePrevues": self.heuresConduitePrevues,
            "pourcentage": self.pourcentage,
            "pretPourExamen": self.pretPourExamen,
        }


def _minutes(seance: dict) -> int:
    debut, fin = seance.get("debut"), seance.get("fin")
    if not isinstance(debut, datetime) or not isinstance(fin, datetime):
        return 0
    return max(0, int((fin - debut).total_seconds() // 60))


def progression_eleve(
    seances: Iterable[dict], *, code_prevues: int, conduite_prevues: int
) -> Progression:
    minutes_code = 0
    minutes_conduite = 0
    for s in seances:
        if s.get("statut") != StatutSeance.EFFECTUEE.value:
            continue
        if s.get("type") == TypeSeance.CODE.value:
            minutes_code += _minutes(s)
        else:
            minutes_conduite += _minutes(s)

    faites_code = minutes_code // MINUTES_PAR_HEURE
    faites_conduite = minutes_conduite // MINUTES_PAR_HEURE
    total_prevu = max(0, code_prevues) + max(0, conduite_prevues)
    total_fait = faites_code + faites_conduite
    pourcentage = 100 if total_prevu == 0 else min(100, round(total_fait * 100 / total_prevu))
    pret = faites_code >= code_prevues and faites_conduite >= conduite_prevues
    return Progression(
        heuresCodeFaites=faites_code,
        heuresConduiteFaites=faites_conduite,
        heuresCodePrevues=code_prevues,
        heuresConduitePrevues=conduite_prevues,
        pourcentage=int(pourcentage),
        pretPourExamen=bool(pret),
    )


# ---------------------------------------------------------------------------
# Planning
# ---------------------------------------------------------------------------


def _chevauche(debut_a: datetime, fin_a: datetime, debut_b: datetime, fin_b: datetime) -> bool:
    """Deux créneaux se chevauchent si chacun commence avant la fin de l'autre.

    Le contact bord à bord (10h–11h puis 11h–12h) n'est PAS un chevauchement.
    """
    return debut_a < fin_b and fin_a > debut_b


def conflits_seance(
    *,
    debut: datetime,
    fin: datetime,
    moniteur_id: str,
    vehicule_id: str,
    existantes: Iterable[dict],
    ignorer_id: str = "",
) -> list[dict]:
    """Liste les séances déjà posées qui entrent en conflit avec ce créneau."""
    conflits: list[dict] = []
    for s in existantes:
        if s.get("id") == ignorer_id:
            continue
        if s.get("statut") in (StatutSeance.ANNULEE.value,):
            continue
        s_debut, s_fin = s.get("debut"), s.get("fin")
        if not isinstance(s_debut, datetime) or not isinstance(s_fin, datetime):
            continue
        if not _chevauche(debut, fin, s_debut, s_fin):
            continue
        meme_moniteur = moniteur_id and s.get("moniteurId") == moniteur_id
        meme_vehicule = vehicule_id and s.get("vehiculeId") == vehicule_id
        if meme_moniteur or meme_vehicule:
            conflits.append(
                {
                    "id": s.get("id", ""),
                    "motif": "moniteur" if meme_moniteur else "vehicule",
                    "debut": s_debut,
                    "fin": s_fin,
                }
            )
    return conflits


# ---------------------------------------------------------------------------
# Moniteurs
# ---------------------------------------------------------------------------


def heures_moniteur(seances: Iterable[dict], moniteur_id: str) -> int:
    """Minutes effectuées par un moniteur, converties en heures pleines."""
    minutes = sum(
        _minutes(s)
        for s in seances
        if s.get("moniteurId") == moniteur_id
        and s.get("statut") == StatutSeance.EFFECTUEE.value
    )
    return minutes // MINUTES_PAR_HEURE


def salaire_moniteur(seances: Iterable[dict], moniteur_id: str, tarif_horaire: int) -> dict:
    heures = heures_moniteur(seances, moniteur_id)
    return {
        "heures": heures,
        "tarifHoraire": max(0, tarif_horaire),
        "montant": heures * max(0, tarif_horaire),
    }


# ---------------------------------------------------------------------------
# Parc automobile
# ---------------------------------------------------------------------------

SEUIL_ALERTE_JOURS = 30


def alertes_vehicule(vehicule: dict, *, aujourdhui: date | None = None) -> list[dict]:
    """Échéances administratives expirées ou proches de l'expiration."""
    jour = aujourdhui or date.today()
    limite = jour + timedelta(days=SEUIL_ALERTE_JOURS)
    libelles = {
        "assuranceExpire": "Assurance",
        "visiteTechniqueExpire": "Visite technique",
        "vignetteExpire": "Vignette",
    }
    alertes: list[dict] = []
    for champ, libelle in libelles.items():
        echeance = vehicule.get(champ)
        if isinstance(echeance, datetime):
            echeance = echeance.date()
        if not isinstance(echeance, date):
            continue
        if echeance < jour:
            alertes.append(
                {
                    "champ": champ,
                    "libelle": libelle,
                    "echeance": echeance,
                    "niveau": "expire",
                    "jours": (echeance - jour).days,
                }
            )
        elif echeance <= limite:
            alertes.append(
                {
                    "champ": champ,
                    "libelle": libelle,
                    "echeance": echeance,
                    "niveau": "bientot",
                    "jours": (echeance - jour).days,
                }
            )
    return alertes


# ---------------------------------------------------------------------------
# Tableau de bord
# ---------------------------------------------------------------------------


def kpis_ecole(
    *,
    eleves: Sequence[dict],
    paiements: Sequence[dict],
    depenses: Sequence[dict],
    seances: Sequence[dict],
    jour: date | None = None,
) -> dict:
    """Indicateurs consolidés de l'auto-école."""
    aujourdhui = jour or date.today()

    actifs = [e for e in eleves if e.get("statut") == StatutEleve.ACTIF.value]
    diplomes = [e for e in eleves if e.get("statut") == StatutEleve.DIPLOME.value]
    abandons = [e for e in eleves if e.get("statut") == StatutEleve.ABANDON.value]

    du_total = sum(int(e.get("montantTotal", 0)) for e in eleves)
    encaisse_total = sum(int(p.get("montant", 0)) for p in paiements)
    encaisse_jour = sum(
        int(p.get("montant", 0))
        for p in paiements
        if _en_date(p.get("date")) == aujourdhui
    )
    encaisse_mois = sum(
        int(p.get("montant", 0))
        for p in paiements
        if _meme_mois(_en_date(p.get("date")), aujourdhui)
    )
    depenses_mois = sum(
        int(d.get("montant", 0))
        for d in depenses
        if _meme_mois(_en_date(d.get("date")), aujourdhui)
    )

    # Taux de réussite : sur les élèves dont le parcours est terminé.
    termines = len(diplomes) + len([e for e in eleves if e.get("statut") == StatutEleve.RECALE.value])
    taux_reussite = 0 if termines == 0 else round(len(diplomes) * 100 / termines)

    seances_jour = [s for s in seances if _en_date(s.get("debut")) == aujourdhui]

    return {
        "elevesActifs": len(actifs),
        "elevesTotal": len(eleves),
        "diplomes": len(diplomes),
        "abandons": len(abandons),
        "tauxReussite": int(taux_reussite),
        "duTotal": du_total,
        "encaisseTotal": encaisse_total,
        "resteARecouvrer": max(0, du_total - encaisse_total),
        "encaisseJour": encaisse_jour,
        "encaisseMois": encaisse_mois,
        "depensesMois": depenses_mois,
        "beneficeMois": encaisse_mois - depenses_mois,
        "seancesJour": len(seances_jour),
    }


def revenus_par_mois(paiements: Iterable[dict], *, nb_mois: int = 12, jour: date | None = None) -> list[dict]:
    """Encaissements des `nb_mois` derniers mois, du plus ancien au plus récent."""
    aujourdhui = jour or date.today()
    mois: list[tuple[int, int]] = []
    annee, m = aujourdhui.year, aujourdhui.month
    for _ in range(nb_mois):
        mois.append((annee, m))
        m -= 1
        if m == 0:
            m, annee = 12, annee - 1
    mois.reverse()

    cumuls = {cle: 0 for cle in mois}
    for p in paiements:
        d = _en_date(p.get("date"))
        if d is None:
            continue
        cle = (d.year, d.month)
        if cle in cumuls:
            cumuls[cle] += int(p.get("montant", 0))
    return [
        {"annee": a, "mois": m_, "libelle": f"{m_:02d}/{a}", "montant": cumuls[(a, m_)]}
        for (a, m_) in mois
    ]


def _en_date(valeur) -> date | None:
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


def _meme_mois(a: date | None, b: date) -> bool:
    return a is not None and a.year == b.year and a.month == b.month
