/** Briques d'interface réutilisées partout. */

import type { ReactNode } from "react";
import { useEffect } from "react";

import type { StatutEleve, StatutSeance } from "../types";
import { LIBELLE_STATUT_ELEVE, LIBELLE_STATUT_SEANCE } from "../format";

export function Carte({
  titre, action, children,
}: { titre?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="carte">
      {titre && (
        <div className="carte-titre">
          <span>{titre}</span>
          {action && <span className="action">{action}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tuile({
  libelle, valeur, detail, ton,
}: { libelle: string; valeur: ReactNode; detail?: string; ton?: "vert" | "orange" | "rouge" }) {
  return (
    <div className={`tuile${ton ? ` ${ton}` : ""}`}>
      <div className="libelle">{libelle}</div>
      <div className="valeur">{valeur}</div>
      {detail && <div className="detail">{detail}</div>}
    </div>
  );
}

export function Badge({ children, ton }: { children: ReactNode; ton?: Ton }) {
  return <span className={`badge${ton ? ` ${ton}` : ""}`}>{children}</span>;
}

type Ton = "vert" | "orange" | "rouge" | "bleu" | undefined;

const TON_STATUT_ELEVE: Record<StatutEleve, Ton> = {
  actif: "vert",
  suspendu: "orange",
  diplome: "bleu",   // un diplômé n'est plus « en cours » : bleu, pas vert
  abandon: "rouge",
  recale: "rouge",
};

export function BadgeStatutEleve({ statut }: { statut: StatutEleve }) {
  return <Badge ton={TON_STATUT_ELEVE[statut]}>{LIBELLE_STATUT_ELEVE[statut]}</Badge>;
}

const TON_STATUT_SEANCE: Record<StatutSeance, Ton> = {
  planifiee: undefined,
  effectuee: "vert",
  annulee: "orange",
  absent: "rouge",
};

export function BadgeStatutSeance({ statut }: { statut: StatutSeance }) {
  return <Badge ton={TON_STATUT_SEANCE[statut]}>{LIBELLE_STATUT_SEANCE[statut]}</Badge>;
}

export function Jauge({ pourcentage, ton }: { pourcentage: number; ton?: "orange" }) {
  const valeur = Math.max(0, Math.min(100, Math.round(pourcentage)));
  return (
    <div
      className={`jauge${ton ? ` ${ton}` : ""}`}
      role="progressbar"
      aria-valuenow={valeur}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${valeur}%` }} />
    </div>
  );
}

export function Initiales({ nom, prenoms }: { nom: string; prenoms?: string }) {
  const lettres = `${(prenoms ?? "").charAt(0)}${nom.charAt(0)}`.toUpperCase() || "?";
  return <div className="pastille" aria-hidden="true">{lettres}</div>;
}

export function Champ({
  etiquette, aide, children,
}: { etiquette: string; aide?: string; children: ReactNode }) {
  return (
    <label className="champ">
      <span className="etiquette">{etiquette}</span>
      {children}
      {aide && <span className="aide">{aide}</span>}
    </label>
  );
}

export function Message({
  ton = "info", children,
}: { ton?: "erreur" | "succes" | "info" | "alerte"; children: ReactNode }) {
  return (
    <div className={`message ${ton}`} role={ton === "erreur" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Vide({ icone = "📭", children }: { icone?: string; children: ReactNode }) {
  return (
    <div className="vide">
      <span className="icone" aria-hidden="true">{icone}</span>
      {children}
    </div>
  );
}

export function Chargement({ lignes = 3 }: { lignes?: number }) {
  return (
    <div className="liste" aria-busy="true" aria-label="Chargement en cours">
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="squelette" style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function Feuille({
  titre, onFermer, children,
}: { titre: string; onFermer: () => void; children: ReactNode }) {
  // Échap ferme la feuille : au clavier, chercher la croix est pénible.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  return (
    <div
      className="voile"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="feuille" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="feuille-entete">
          <h2>{titre}</h2>
          <button type="button" className="fermer" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
