import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { FournisseurSession } from "./session";
import "./styles.css";

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable dans index.html.");

createRoot(racine).render(
  <StrictMode>
    <BrowserRouter>
      <FournisseurSession>
        <App />
      </FournisseurSession>
    </BrowserRouter>
  </StrictMode>,
);
