/** Coquille de l'espace de travail : barre latérale, bandeau, contenu.
 *
 * La barre latérale devient une barre d'onglets en bas sous 860 px — un
 * moniteur consulte son planning sur le terrain, pas devant un écran.
 */

import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { useSession } from "../session";

const LIBELLE_ROLE = {
  directeur: "Directeur",
  secretaire: "Secrétariat",
  moniteur: "Moniteur",
} as const;

interface Onglet {
  chemin: string;
  libelle: string;
  icone: string;
}

export function Atelier({
  titre, sous, outils, children,
}: { titre: string; sous?: string; outils?: ReactNode; children: ReactNode }) {
  const { session, estDirecteur, estMoniteur, peutGerer, deconnecter } = useSession();
  const role = session?.utilisateur?.role;

  // Le filtrage par rôle est un confort d'affichage. L'autorisation réelle est
  // côté serveur : masquer une entrée n'empêche personne d'appeler l'API.
  const onglets: Onglet[] = [
    ...(estMoniteur ? [] : [{ chemin: "/tableau-de-bord", libelle: "Tableau de bord", icone: "◱" }]),
    { chemin: "/eleves", libelle: "Élèves", icone: "◲" },
    ...(peutGerer ? [{ chemin: "/comptabilite", libelle: "Comptabilité", icone: "◳" }] : []),
    { chemin: "/planning", libelle: "Planning", icone: "◰" },
    ...(peutGerer ? [{ chemin: "/flotte", libelle: "Flotte auto", icone: "◴" }] : []),
    ...(estDirecteur ? [{ chemin: "/moniteurs", libelle: "Moniteurs", icone: "◵" }] : []),
    ...(peutGerer ? [{ chemin: "/convocations", libelle: "Convocations CGI", icone: "◈" }] : []),
    ...(estDirecteur ? [{ chemin: "/reglages", libelle: "Réglages", icone: "◷" }] : []),
  ];

  return (
    <div className="atelier">
      <aside className="rail">
        <div className="rail-marque">
          <div className="nom">GO PERMIS 225</div>
          <div className="sous">Auto-école · CI</div>
        </div>

        <nav className="rail-nav" aria-label="Navigation principale">
          {onglets.map((o) => (
            <NavLink
              key={o.chemin}
              to={o.chemin}
              className={({ isActive }) => (isActive ? "actif" : "")}
            >
              <span className="icone" aria-hidden="true">{o.icone}</span>
              {o.libelle}
            </NavLink>
          ))}
        </nav>

        <div className="rail-pied">
          <div className="qui">{session?.utilisateur?.nom}</div>
          <div className="role">{role ? LIBELLE_ROLE[role] : ""}</div>
          <div className="ecole">{session?.ecole?.nom}</div>
          <button type="button" className="bouton doux large" onClick={deconnecter}>
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="plan">
        <header className="bandeau">
          <div className="titre">
            <h1>{titre}</h1>
            {sous && <div className="sous">{sous}</div>}
          </div>
          {outils && <div className="outils">{outils}</div>}
        </header>
        <main className="feuille-travail">{children}</main>
      </div>
    </div>
  );
}
