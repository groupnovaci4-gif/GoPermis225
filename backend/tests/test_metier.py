"""Calculs métier — module pur, testable sans base ni réseau."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from lib.metier import (
    alertes_vehicule,
    conflits_seance,
    kpis_ecole,
    numero_recu,
    progression_eleve,
    revenus_par_mois,
    salaire_moniteur,
    solde_eleve,
)

H = lambda j, h: datetime(2026, 10, j, h, 0)  # noqa: E731


def _seance(j, h_debut, h_fin, *, statut="effectuee", type_="conduite",
            moniteur="m1", vehicule="v1", eleve="e1", id_="s1"):
    return {"id": id_, "eleveId": eleve, "moniteurId": moniteur, "vehiculeId": vehicule,
            "type": type_, "statut": statut, "debut": H(j, h_debut), "fin": H(j, h_fin)}


# --- Argent ---------------------------------------------------------------


def test_le_solde_additionne_les_versements():
    solde = solde_eleve(150_000, [{"montant": 50_000}, {"montant": 25_000}])
    assert solde.totalPaye == 75_000
    assert solde.reste == 75_000
    assert solde.tauxRecouvrement == 50


def test_le_reste_n_est_jamais_negatif_et_le_trop_percu_est_signale():
    """Masquer un trop-perçu avec un max(0) silencieux ferait disparaître une
    erreur de caisse. On borne le reste ET on expose l'excédent."""
    solde = solde_eleve(100_000, [{"montant": 120_000}])
    assert solde.reste == 0
    assert solde.tropPercu == 20_000
    assert solde.tauxRecouvrement == 100


def test_solde_d_un_eleve_sans_montant_du():
    solde = solde_eleve(0, [])
    assert solde.reste == 0
    assert solde.tauxRecouvrement == 100


def test_le_numero_de_recu_est_stable_et_prefixe():
    assert numero_recu("Auto-École Ivoire", 1) == "REC-AUT-000001"
    assert numero_recu("Auto-École Ivoire", 4321) == "REC-AUT-004321"
    assert numero_recu("", 7) == "REC-GPS-000007"


# --- Progression ----------------------------------------------------------


def test_seules_les_seances_effectuees_comptent():
    seances = [
        _seance(1, 8, 10, statut="effectuee"),
        _seance(2, 8, 10, statut="planifiee"),
        _seance(3, 8, 10, statut="annulee"),
        _seance(4, 8, 10, statut="absent"),
    ]
    progression = progression_eleve(seances, code_prevues=0, conduite_prevues=20)
    assert progression.heuresConduiteFaites == 2


def test_code_et_conduite_sont_comptes_separement():
    seances = [
        _seance(1, 8, 11, type_="code"),
        _seance(2, 8, 10, type_="conduite"),
    ]
    progression = progression_eleve(seances, code_prevues=20, conduite_prevues=20)
    assert progression.heuresCodeFaites == 3
    assert progression.heuresConduiteFaites == 2
    # 5 h sur 40 = 12,5 %. `round()` de Python arrondit au pair le plus
    # proche (« banker's rounding »), donc 12 et non 13.
    assert progression.pourcentage == 12


def test_pret_pour_examen_exige_les_deux_volumes():
    """Avoir fini la conduite ne suffit pas si le code n'est pas fait."""
    conduite_seule = [_seance(j, 8, 9, type_="conduite", id_=f"s{j}") for j in range(1, 3)]
    progression = progression_eleve(conduite_seule, code_prevues=2, conduite_prevues=2)
    assert progression.heuresConduiteFaites == 2
    assert progression.pretPourExamen is False

    complet = conduite_seule + [
        _seance(j, 14, 15, type_="code", id_=f"c{j}") for j in range(1, 3)
    ]
    assert progression_eleve(complet, code_prevues=2, conduite_prevues=2).pretPourExamen is True


def test_le_pourcentage_est_borne_a_cent():
    seances = [_seance(j, 8, 12, id_=f"s{j}") for j in range(1, 10)]
    progression = progression_eleve(seances, code_prevues=0, conduite_prevues=2)
    assert progression.pourcentage == 100


# --- Conflits de planning -------------------------------------------------


def test_un_chevauchement_sur_le_meme_moniteur_est_un_conflit():
    existantes = [_seance(1, 9, 11, statut="planifiee")]
    conflits = conflits_seance(
        debut=H(1, 10), fin=H(1, 12), moniteur_id="m1", vehicule_id="v9",
        existantes=existantes,
    )
    assert len(conflits) == 1
    assert conflits[0]["motif"] == "moniteur"


def test_un_chevauchement_sur_le_meme_vehicule_est_un_conflit():
    existantes = [_seance(1, 9, 11, statut="planifiee", moniteur="autre")]
    conflits = conflits_seance(
        debut=H(1, 10), fin=H(1, 12), moniteur_id="m9", vehicule_id="v1",
        existantes=existantes,
    )
    assert len(conflits) == 1
    assert conflits[0]["motif"] == "vehicule"


def test_deux_creneaux_bord_a_bord_ne_sont_pas_en_conflit():
    """10h–11h puis 11h–12h : c'est une journée normale, pas un conflit."""
    existantes = [_seance(1, 10, 11, statut="planifiee")]
    conflits = conflits_seance(
        debut=H(1, 11), fin=H(1, 12), moniteur_id="m1", vehicule_id="v1",
        existantes=existantes,
    )
    assert conflits == []


def test_une_seance_annulee_ne_bloque_plus_le_creneau():
    existantes = [_seance(1, 9, 11, statut="annulee")]
    conflits = conflits_seance(
        debut=H(1, 10), fin=H(1, 12), moniteur_id="m1", vehicule_id="v1",
        existantes=existantes,
    )
    assert conflits == []


def test_une_seance_ne_se_bloque_pas_elle_meme_quand_on_la_deplace():
    existantes = [_seance(1, 9, 11, statut="planifiee", id_="a-deplacer")]
    conflits = conflits_seance(
        debut=H(1, 10), fin=H(1, 12), moniteur_id="m1", vehicule_id="v1",
        existantes=existantes, ignorer_id="a-deplacer",
    )
    assert conflits == []


def test_sans_vehicule_seul_le_moniteur_compte():
    existantes = [_seance(1, 9, 11, statut="planifiee", moniteur="autre", vehicule="")]
    conflits = conflits_seance(
        debut=H(1, 10), fin=H(1, 12), moniteur_id="m1", vehicule_id="",
        existantes=existantes,
    )
    assert conflits == []


# --- Moniteurs ------------------------------------------------------------


def test_le_salaire_porte_sur_les_heures_effectuees():
    seances = [
        _seance(1, 8, 10, statut="effectuee"),
        _seance(2, 8, 10, statut="planifiee"),
        _seance(3, 8, 10, statut="effectuee", moniteur="m2"),
    ]
    fiche = salaire_moniteur(seances, "m1", 2_500)
    assert fiche == {"heures": 2, "tarifHoraire": 2_500, "montant": 5_000}


def test_un_tarif_absent_donne_un_salaire_nul_pas_une_erreur():
    assert salaire_moniteur([_seance(1, 8, 10)], "m1", 0)["montant"] == 0


# --- Parc automobile ------------------------------------------------------


def test_une_echeance_depassee_est_signalee_comme_expiree():
    jour = date(2026, 10, 1)
    alertes = alertes_vehicule({"assuranceExpire": date(2026, 9, 1)}, aujourdhui=jour)
    assert len(alertes) == 1
    assert alertes[0]["niveau"] == "expire"
    assert alertes[0]["libelle"] == "Assurance"


def test_une_echeance_proche_est_signalee_avant_terme():
    jour = date(2026, 10, 1)
    alertes = alertes_vehicule(
        {"visiteTechniqueExpire": jour + timedelta(days=10)}, aujourdhui=jour
    )
    assert alertes[0]["niveau"] == "bientot"
    assert alertes[0]["jours"] == 10


def test_une_echeance_lointaine_ne_declenche_rien():
    jour = date(2026, 10, 1)
    assert alertes_vehicule(
        {"assuranceExpire": jour + timedelta(days=200)}, aujourdhui=jour
    ) == []


def test_les_dates_stockees_en_chaine_sont_comprises():
    """Les échéances sont persistées en chaînes ISO (BSON n'encode pas `date`).

    Si l'alerte n'acceptait que des objets `date`, elle ne se déclencherait
    jamais en production : le champ relu depuis Mongo est toujours une chaîne.
    """
    jour = date(2026, 10, 1)

    expiree = alertes_vehicule({"assuranceExpire": "2026-09-01"}, aujourdhui=jour)
    assert len(expiree) == 1
    assert expiree[0]["niveau"] == "expire"
    assert expiree[0]["jours"] == -30

    proche = alertes_vehicule({"visiteTechniqueExpire": "2026-10-10"}, aujourdhui=jour)
    assert proche[0]["niveau"] == "bientot"
    assert proche[0]["jours"] == 9

    assert alertes_vehicule({"assuranceExpire": "2027-06-01"}, aujourdhui=jour) == []
    # Une valeur illisible est ignorée, pas devinée.
    assert alertes_vehicule({"assuranceExpire": "bientot"}, aujourdhui=jour) == []


# --- Tableau de bord ------------------------------------------------------


def test_les_kpis_consolident_eleves_et_encaissements():
    jour = date(2026, 10, 15)
    eleves = [
        {"statut": "actif", "montantTotal": 100_000},
        {"statut": "actif", "montantTotal": 100_000},
        {"statut": "diplome", "montantTotal": 100_000},
        {"statut": "recale", "montantTotal": 100_000},
        {"statut": "abandon", "montantTotal": 100_000},
    ]
    paiements = [
        {"montant": 50_000, "date": jour},
        {"montant": 30_000, "date": date(2026, 10, 2)},
        {"montant": 20_000, "date": date(2026, 9, 2)},
    ]
    kpis = kpis_ecole(eleves=eleves, paiements=paiements,
                      depenses=[{"montant": 10_000, "date": jour}], seances=[], jour=jour)

    assert kpis["elevesActifs"] == 2
    assert kpis["duTotal"] == 500_000
    assert kpis["encaisseTotal"] == 100_000
    assert kpis["resteARecouvrer"] == 400_000
    assert kpis["encaisseJour"] == 50_000
    assert kpis["encaisseMois"] == 80_000
    assert kpis["beneficeMois"] == 70_000
    assert kpis["tauxReussite"] == 50  # 1 diplômé / (1 diplômé + 1 recalé)


def test_le_taux_de_reussite_sans_parcours_termine_vaut_zero():
    kpis = kpis_ecole(eleves=[{"statut": "actif", "montantTotal": 0}],
                      paiements=[], depenses=[], seances=[])
    assert kpis["tauxReussite"] == 0


def test_les_revenus_couvrent_douze_mois_glissants():
    jour = date(2026, 10, 15)
    revenus = revenus_par_mois(
        [{"montant": 10_000, "date": date(2026, 10, 3)},
         {"montant": 5_000, "date": date(2026, 8, 3)},
         {"montant": 999, "date": date(2020, 1, 1)}],  # hors fenêtre
        jour=jour,
    )
    assert len(revenus) == 12
    assert revenus[-1] == {"annee": 2026, "mois": 10, "libelle": "10/2026", "montant": 10_000}
    assert sum(r["montant"] for r in revenus) == 15_000
