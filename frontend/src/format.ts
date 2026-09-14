/** Formatage : argent, dates, libellés. Passer par ces fonctions partout. */

import type {
  Categorie, MotifMessage, MoyenPaiement, ResultatExamen, StatutEleve,
  StatutSeance, TypeSeance,
} from "./types";

/** Espace insécable étroit : « 150 000 FCFA » ne se coupe jamais en fin de ligne. */
const ESPACE = " ";

export function fFCFA(montant: number): string {
  const entier = Math.round(montant || 0);
  return `${entier.toLocaleString("fr-FR").replace(/\s/g, ESPACE)}${ESPACE}FCFA`;
}

/** Version compacte pour les tuiles : 1,2 M au lieu de 1 200 000. */
export function fCompact(montant: number): string {
  const n = Math.round(montant || 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}${ESPACE}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}${ESPACE}k`;
  return n.toLocaleString("fr-FR").replace(/\s/g, ESPACE);
}

export function fDate(valeur?: string | null): string {
  if (!valeur) return "—";
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return String(valeur);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fHeure(valeur?: string | null): string {
  if (!valeur) return "—";
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function fDateHeure(valeur?: string | null): string {
  if (!valeur) return "—";
  return `${fDate(valeur)} à ${fHeure(valeur)}`;
}

export function fDuree(debut: string, fin: string): string {
  const minutes = Math.max(0, (new Date(fin).getTime() - new Date(debut).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Date du jour au format attendu par un <input type="date">. */
export function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const LIBELLE_STATUT_ELEVE: Record<StatutEleve, string> = {
  actif: "En formation",
  suspendu: "Suspendu",
  diplome: "Permis obtenu",
  abandon: "Abandon",
  recale: "Ajourné",
};

export const LIBELLE_MOYEN: Record<MoyenPaiement, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  wave: "Wave",
  mtn_money: "MTN Money",
  moov_money: "Moov Money",
  virement: "Virement",
};

export const LIBELLE_STATUT_SEANCE: Record<StatutSeance, string> = {
  planifiee: "Planifiée",
  effectuee: "Effectuée",
  annulee: "Annulée",
  absent: "Absent",
};

export const LIBELLE_TYPE_SEANCE: Record<TypeSeance, string> = {
  code: "Code",
  conduite: "Conduite",
};

export const LIBELLE_RESULTAT: Record<ResultatExamen, string> = {
  en_attente: "En attente",
  admis: "Admis",
  ajourne: "Ajourné",
};

export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  A: "A — Motos",
  B: "B — Véhicules légers",
  C: "C — Poids lourds",
  D: "D — Transport en commun",
  E: "E — Remorques",
};

export const LIBELLE_MOTIF: Record<MotifMessage, string> = {
  rappel_seance: "Rappel de séance",
  relance_impaye: "Relance d'impayé",
  convocation: "Convocation à l'examen",
  felicitations: "Félicitations",
  lien_portail: "Lien de suivi",
  libre: "Message libre",
};

/** Lien personnel du portail élève, valable sous n'importe quel préfixe.
 *
 * On repart de l'adresse de la page courante — sans son ancre — pour que le
 * lien reste juste que l'application soit servie à la racine ou derrière un
 * proxy de chemin.
 */
export function lienPortail(jeton: string): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#/portail/${jeton}`;
}

/** Message WhatsApp pré-rempli, ouvert via wa.me. */
export function lienWhatsApp(telephone: string, message: string): string {
  const numero = telephone.replace(/\D/g, "");
  const international = numero.length === 10 ? `225${numero}` : numero;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
