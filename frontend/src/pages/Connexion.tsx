/** Connexion du personnel et création d'une auto-école. */

import { useState } from "react";

import { Champ, Message } from "../components/ui";
import { useEnvoi } from "../hooks";
import { useSession } from "../session";

export default function Connexion() {
  const { connecter, inscrire } = useSession();
  const { envoi, erreur, executer } = useEnvoi();
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");

  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nomEcole, setNomEcole] = useState("");
  const [commune, setCommune] = useState("");
  const [nomDirecteur, setNomDirecteur] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "connexion") {
      await executer(() => connecter(telephone, motDePasse));
    } else {
      await executer(() =>
        inscrire({ nomEcole, commune, nomDirecteur, telephone, motDePasse }),
      );
    }
  }

  return (
    <div className="pleine-page">
      <div>
        <div className="centre" style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 40 }} aria-hidden="true">🚗</div>
          <h1 style={{ fontSize: 24 }}>Go Permis 225</h1>
          <p className="doux">Gestion des auto-écoles de Côte d'Ivoire</p>
        </div>

        <form className="carte" onSubmit={soumettre}>
          {mode === "inscription" && (
            <>
              <Champ etiquette="Nom de l'auto-école">
                <input
                  value={nomEcole}
                  onChange={(e) => setNomEcole(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="organization"
                  placeholder="Auto-École La Réussite"
                />
              </Champ>
              <Champ etiquette="Commune">
                <input
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  maxLength={120}
                  placeholder="Yopougon"
                />
              </Champ>
              <Champ etiquette="Nom du directeur">
                <input
                  value={nomDirecteur}
                  onChange={(e) => setNomDirecteur(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </Champ>
            </>
          )}

          <Champ etiquette="Numéro de téléphone" aide="10 chiffres, sans indicatif">
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="07 01 02 03 04"
            />
          </Champ>

          <Champ
            etiquette="Mot de passe"
            aide={mode === "inscription" ? "8 caractères minimum" : undefined}
          >
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              minLength={mode === "inscription" ? 8 : 1}
              autoComplete={mode === "inscription" ? "new-password" : "current-password"}
            />
          </Champ>

          {erreur && <Message ton="erreur">{erreur}</Message>}

          <button type="submit" className="bouton large" disabled={envoi} style={{ marginTop: 12 }}>
            {envoi
              ? "Veuillez patienter…"
              : mode === "connexion"
                ? "Se connecter"
                : "Créer mon auto-école"}
          </button>
        </form>

        <p className="centre doux" style={{ marginTop: 14 }}>
          {mode === "connexion" ? (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                className="bouton fantome petit"
                onClick={() => setMode("inscription")}
              >
                Créer mon auto-école
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bouton fantome petit"
              onClick={() => setMode("connexion")}
            >
              J'ai déjà un compte
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
