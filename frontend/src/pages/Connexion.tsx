/** Connexion en écran scindé : argumentaire à gauche, formulaire à droite. */

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Illustration } from "../components/Illustration";
import { Avis, Champ } from "../components/ui";
import { useEnvoi } from "../hooks";
import { useSession } from "../session";

export default function Connexion() {
  const [parametres] = useSearchParams();
  const { connecter, inscrire, connecterPortail } = useSession();
  const { envoi, erreur, executer } = useEnvoi();

  const [acces, setAcces] = useState<"ecole" | "eleve">("ecole");
  const [creation, setCreation] = useState(parametres.get("creer") === "1");

  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nomEcole, setNomEcole] = useState("");
  const [commune, setCommune] = useState("");
  const [nomDirecteur, setNomDirecteur] = useState("");
  const [jetonEleve, setJetonEleve] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (acces === "eleve") {
      await executer(() => connecterPortail(jetonEleve.trim()));
    } else if (creation) {
      await executer(() => inscrire({ nomEcole, commune, nomDirecteur, telephone, motDePasse }));
    } else {
      await executer(() => connecter(telephone, motDePasse));
    }
  }

  return (
    <div className="scinde">
      <div className="scinde-gauche">
        <Illustration
          nom="connexion.jpg"
          alt="Une élève consulte son suivi de formation sur son téléphone"
          position="center 30%"
        />
        <div className="sur-titre" style={{ color: "rgba(255,255,255,.55)" }}>
          Espace de gestion
        </div>
        <h2 style={{ marginTop: 12 }}>Toute votre auto-école dans un seul outil.</h2>
        <p>
          Suivi des élèves, encaissements en FCFA (espèces, Wave, Orange Money,
          MTN), planning des leçons sans double réservation, alertes sur les
          papiers des véhicules et relances WhatsApp — pensé pour les auto-écoles
          de Côte d'Ivoire.
        </p>
        <p style={{ fontSize: 12.5 }}>
          Connexion cloisonnée : chaque auto-école ne voit que ses propres données.
        </p>
        <div className="lieu">Abidjan · Côte d'Ivoire</div>
      </div>

      <div className="scinde-droite">
        <div>
          <Link to="/" className="faible" style={{ textDecoration: "none" }}>
            ← Go Permis 225
          </Link>

          <h1 style={{ fontSize: 21, marginTop: 14 }}>Connexion</h1>
          <p className="faible" style={{ marginBottom: 16 }}>
            Choisissez votre accès, puis entrez vos identifiants.
          </p>

          <div className="onglets" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={acces === "ecole"}
              className={acces === "ecole" ? "actif" : ""}
              onClick={() => setAcces("ecole")}
            >
              Auto-école
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={acces === "eleve"}
              className={acces === "eleve" ? "actif" : ""}
              onClick={() => setAcces("eleve")}
            >
              Élève
            </button>
          </div>

          <form onSubmit={soumettre}>
            {acces === "eleve" ? (
              <>
                <p className="faible" style={{ marginBottom: 12 }}>
                  Votre auto-école vous a envoyé un lien personnel par WhatsApp.
                  Ouvrez-le directement, ou collez son code ci-dessous.
                </p>
                <Champ etiquette="Code de votre lien de suivi">
                  <input
                    value={jetonEleve}
                    onChange={(e) => setJetonEleve(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="Collez ici la fin de votre lien"
                  />
                </Champ>
              </>
            ) : (
              <>
                {creation && (
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
                  aide={creation ? "8 caractères minimum" : undefined}
                >
                  <input
                    type="password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    minLength={creation ? 8 : 1}
                    autoComplete={creation ? "new-password" : "current-password"}
                  />
                </Champ>
              </>
            )}

            {erreur && <Avis ton="erreur">{erreur}</Avis>}

            <button type="submit" className="bouton large" disabled={envoi} style={{ marginTop: 12 }}>
              {envoi
                ? "Veuillez patienter…"
                : acces === "eleve"
                  ? "Ouvrir mon suivi"
                  : creation
                    ? "Créer mon auto-école"
                    : "Se connecter"}
            </button>
          </form>

          {acces === "ecole" && (
            <div
              className="bloc"
              style={{ marginTop: 16, padding: 13, background: "var(--vert-pale)", borderColor: "transparent" }}
            >
              {creation ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>Vous avez déjà un espace ?</div>
                  <button
                    type="button"
                    className="bouton doux large"
                    style={{ marginTop: 8 }}
                    onClick={() => setCreation(false)}
                  >
                    Revenir à la connexion
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                    Vous êtes responsable d'une auto-école ?
                  </div>
                  <div className="faible">
                    Ouvrez votre propre espace, privé et indépendant, en moins d'une minute.
                  </div>
                  <button
                    type="button"
                    className="bouton large"
                    style={{ marginTop: 8 }}
                    onClick={() => setCreation(true)}
                  >
                    Créer une auto-école
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
