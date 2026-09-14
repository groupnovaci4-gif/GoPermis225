/** Routage et navigation, par rôle.
 *
 * Le filtrage par rôle fait ici est un confort d'affichage. La vraie
 * autorisation est côté serveur : masquer un bouton n'empêche personne
 * d'appeler l'API.
 */

import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useSession } from "./session";
import Connexion from "./pages/Connexion";
import TableauBord from "./pages/TableauBord";
import Eleves from "./pages/Eleves";
import EleveDetail from "./pages/EleveDetail";
import Planning from "./pages/Planning";
import Finances from "./pages/Finances";
import Personnel from "./pages/Personnel";
import Vehicules from "./pages/Vehicules";
import Reglages from "./pages/Reglages";
import Portail from "./pages/Portail";

interface Onglet {
  chemin: string;
  libelle: string;
  icone: string;
}

export default function App() {
  const { session, pret, estDirecteur, estMoniteur, peutGerer } = useSession();
  const emplacement = useLocation();

  // Le portail élève vit sur ses propres adresses, hors de l'espace école.
  const versPortail = emplacement.pathname.startsWith("/portail");

  if (!pret) {
    return (
      <div className="pleine-page">
        <p className="doux centre">Chargement…</p>
      </div>
    );
  }

  if (versPortail) {
    return (
      <Routes>
        <Route path="/portail" element={<Portail />} />
        <Route path="/portail/:jeton" element={<Portail />} />
      </Routes>
    );
  }

  if (!session) return <Connexion />;

  if (session.cote === "eleve") {
    // Un jeton élève ne donne accès qu'au portail.
    return <Navigate to="/portail" replace />;
  }

  const onglets: Onglet[] = [
    { chemin: "/", libelle: estMoniteur ? "Planning" : "Accueil", icone: estMoniteur ? "📅" : "🏠" },
    { chemin: "/eleves", libelle: "Élèves", icone: "👥" },
    ...(estMoniteur ? [] : [{ chemin: "/planning", libelle: "Planning", icone: "📅" }]),
    ...(peutGerer ? [{ chemin: "/finances", libelle: "Caisse", icone: "💰" }] : []),
    ...(estDirecteur ? [{ chemin: "/reglages", libelle: "Réglages", icone: "⚙️" }] : []),
  ];

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={estMoniteur ? <Planning /> : <TableauBord />} />
        <Route path="/eleves" element={<Eleves />} />
        <Route path="/eleves/:id" element={<EleveDetail />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/personnel" element={<Personnel />} />
        <Route path="/vehicules" element={<Vehicules />} />
        <Route path="/reglages" element={<Reglages />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="barre-nav" aria-label="Navigation principale">
        {onglets.map((o) => (
          <NavLink
            key={o.chemin}
            to={o.chemin}
            end={o.chemin === "/"}
            className={({ isActive }) => (isActive ? "actif" : "")}
          >
            <span className="icone" aria-hidden="true">{o.icone}</span>
            {o.libelle}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
