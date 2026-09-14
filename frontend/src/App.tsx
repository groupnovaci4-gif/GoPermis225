/** Routage.
 *
 * Trois espaces distincts : la vitrine publique, l'espace de gestion
 * (personnel authentifié) et le portail élève. Un jeton élève n'ouvre que le
 * portail ; le filtrage par rôle à l'intérieur de l'espace de gestion est un
 * confort d'affichage, l'autorisation réelle étant côté serveur.
 */

import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useSession } from "./session";
import Comptabilite from "./pages/Comptabilite";
import Convocations from "./pages/Convocations";
import Connexion from "./pages/Connexion";
import EleveDetail from "./pages/EleveDetail";
import Eleves from "./pages/Eleves";
import Flotte from "./pages/Flotte";
import Moniteurs from "./pages/Moniteurs";
import Planning from "./pages/Planning";
import Portail from "./pages/Portail";
import Reglages from "./pages/Reglages";
import TableauBord from "./pages/TableauBord";
import Vitrine from "./pages/Vitrine";

export default function App() {
  const { session, pret, estMoniteur } = useSession();
  const emplacement = useLocation();

  if (!pret) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <p className="faible">Chargement…</p>
      </div>
    );
  }

  // Le portail élève vit sur ses propres adresses, hors de l'espace de gestion.
  if (emplacement.pathname.startsWith("/portail")) {
    return (
      <Routes>
        <Route path="/portail" element={<Portail />} />
        <Route path="/portail/:jeton" element={<Portail />} />
      </Routes>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Vitrine />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
    );
  }

  if (session.cote === "eleve") return <Navigate to="/portail" replace />;

  const accueil = estMoniteur ? "/planning" : "/tableau-de-bord";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={accueil} replace />} />
      <Route path="/connexion" element={<Navigate to={accueil} replace />} />
      <Route path="/tableau-de-bord" element={estMoniteur ? <Navigate to="/planning" replace /> : <TableauBord />} />
      <Route path="/eleves" element={<Eleves />} />
      <Route path="/eleves/:id" element={<EleveDetail />} />
      <Route path="/comptabilite" element={<Comptabilite />} />
      <Route path="/planning" element={<Planning />} />
      <Route path="/flotte" element={<Flotte />} />
      <Route path="/convocations" element={<Convocations />} />
      <Route path="/moniteurs" element={<Moniteurs />} />
      <Route path="/reglages" element={<Reglages />} />
      <Route path="*" element={<Navigate to={accueil} replace />} />
    </Routes>
  );
}
