import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// HashRouter et non BrowserRouter : les adresses vivent après un « # », donc
// elles restent valides quel que soit le préfixe sous lequel l'application est
// servie, et l'hébergeur n'a aucune règle de réécriture à configurer pour que
// « /portail/<jeton> » fonctionne au rechargement.
import { HashRouter } from "react-router-dom";

import App from "./App";
import { FournisseurSession } from "./session";
import "./styles.css";

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable dans index.html.");

createRoot(racine).render(
  <StrictMode>
    <HashRouter>
      <FournisseurSession>
        <App />
      </FournisseurSession>
    </HashRouter>
  </StrictMode>,
);
