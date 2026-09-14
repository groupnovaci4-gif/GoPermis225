/** Briques d'interface réutilisées partout. */

import type { ReactNode } from "react";
import { useEffect } from "react";

import { LIBELLE_STATUT_ELEVE, LIBELLE_STATUT_SEANCE } from "../format";
import type { StatutEleve, StatutSeance } from "../types";

type Ton = "vert" | "orange" | "rouge" | "bleu" | undefined;

export function Bloc({
  titre, action, children, sansPadding,
}: { titre?: string; action?: ReactNode; children: ReactNode; sansPadding?: boolean }) {
  return (
    <section className="bloc">
      {(titre || action) && (
        <div className="bloc-tete">
          {titre && <span className="sur-titre">{titre}</span>}
          {action && <span className="action">{action}</span>}
        </div>
      )}
      <div className={sansPadding ? "" : "bloc-corps"}>{children}</div>
    </section>
  );
}

export function Indicateur({
  libelle, valeur, note, glyphe, ton,
}: { libelle: string; valeur: ReactNode; note?: string; glyphe?: string; ton?: "vert" | "orange" | "rouge" }) {
  return (
    <div className={`indicateur${ton ? ` ${ton}` : ""}`}>
      {glyphe && <span className="glyphe" aria-hidden="true">{glyphe}</span>}
      <div className="sur-titre">{libelle}</div>
      <div className="valeur">{valeur}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Jeton({ children, ton }: { children: ReactNode; ton?: Ton }) {
  return <span className={`jeton${ton ? ` ${ton}` : ""}`}>{children}</span>;
}

const TON_STATUT_ELEVE: Record<StatutEleve, Ton> = {
  actif: "vert",
  suspendu: "orange",
  diplome: "bleu",   // un permis obtenu n'est plus « en cours » : bleu, pas vert
  abandon: "rouge",
  recale: "rouge",
};

export function JetonStatutEleve({ statut }: { statut: StatutEleve }) {
  return <Jeton ton={TON_STATUT_ELEVE[statut]}>{LIBELLE_STATUT_ELEVE[statut]}</Jeton>;
}

const TON_STATUT_SEANCE: Record<StatutSeance, Ton> = {
  planifiee: undefined,
  effectuee: "vert",
  annulee: "orange",
  absent: "rouge",
};

export function JetonStatutSeance({ statut }: { statut: StatutSeance }) {
  return <Jeton ton={TON_STATUT_SEANCE[statut]}>{LIBELLE_STATUT_SEANCE[statut]}</Jeton>;
}

export function Barre({ pourcentage, ton }: { pourcentage: number; ton?: "orange" }) {
  const valeur = Math.max(0, Math.min(100, Math.round(pourcentage)));
  return (
    <div
      className={`barre${ton ? ` ${ton}` : ""}`}
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

export function Avis({
  ton = "info", children,
}: { ton?: "erreur" | "succes" | "info" | "alerte"; children: ReactNode }) {
  return (
    <div className={`avis ${ton}`} role={ton === "erreur" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Desert({ glyphe = "—", children }: { glyphe?: string; children: ReactNode }) {
  return (
    <div className="desert">
      <span className="glyphe" aria-hidden="true">{glyphe}</span>
      {children}
    </div>
  );
}

export function Chargement({ lignes = 4 }: { lignes?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement en cours">
      {Array.from({ length: lignes }, (_, i) => <div key={i} className="fantome" />)}
    </div>
  );
}

/** Panneau latéral pour les formulaires — il laisse la liste visible derrière. */
export function Volet({
  titre, onFermer, children,
}: { titre: string; onFermer: () => void; children: ReactNode }) {
  // Échap ferme le volet : au clavier, viser la croix est pénible.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  return (
    <div
      className="voile"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
    >
      <div className="volet" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="volet-tete">
          <h2>{titre}</h2>
          <button type="button" className="fermer" onClick={onFermer} aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Tableau dense. `colonnes` porte les en-têtes ; `droite` aligne à droite. */
export function Grille({
  colonnes, children,
}: { colonnes: { cle: string; libelle: string; droite?: boolean }[]; children: ReactNode }) {
  return (
    <div className="table-enveloppe">
      <table className="grille">
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c.cle} className={c.droite ? "droite" : undefined}>{c.libelle}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
