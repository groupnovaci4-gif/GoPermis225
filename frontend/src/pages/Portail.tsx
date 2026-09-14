/** Portail élève : consultation de son propre dossier, sans installation.
 *
 * L'élève arrive par un lien WhatsApp contenant son jeton. On l'échange
 * aussitôt contre un jeton de session, puis on nettoie l'adresse pour que le
 * jeton ne traîne ni dans l'historique du navigateur ni dans un partage
 * d'écran. Présentation volontairement plus simple que l'espace de gestion :
 * l'élève ouvre la page sur son téléphone, une fois de temps en temps.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import {
  Avis, Barre, Bloc, Chargement, Desert, Grille, JetonStatutEleve, JetonStatutSeance,
} from "../components/ui";
import {
  LIBELLE_MOYEN, LIBELLE_RESULTAT, LIBELLE_TYPE_SEANCE,
  fDate, fDateHeure, fDuree, fFCFA,
} from "../format";
import { useChargement } from "../hooks";
import { useSession } from "../session";
import type { DossierPortail } from "../types";

export default function Portail() {
  const { jeton } = useParams();
  const navigate = useNavigate();
  const { session, connecterPortail, deconnecter } = useSession();
  const [erreurLien, setErreurLien] = useState<string | null>(null);
  const [echange, setEchange] = useState(Boolean(jeton));

  useEffect(() => {
    if (!jeton) return;
    let annule = false;
    connecterPortail(jeton)
      .then(() => {
        // On remplace l'entrée d'historique : le jeton disparaît de l'adresse.
        if (!annule) navigate("/portail", { replace: true });
      })
      .catch(() => {
        if (!annule) {
          setErreurLien("Ce lien n'est plus valide. Demandez-en un nouveau à votre auto-école.");
        }
      })
      .finally(() => { if (!annule) setEchange(false); });
    return () => { annule = true; };
  }, [jeton, connecterPortail, navigate]);

  const connecte = session?.cote === "eleve";
  const { donnees, chargement, erreur } = useChargement<DossierPortail>(
    () => api.get<DossierPortail>("/api/portail"),
    [connecte],
  );

  if (echange) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <p className="faible">Ouverture de votre espace…</p>
      </div>
    );
  }

  if (erreurLien || (!connecte && !jeton)) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
        <div className="bloc" style={{ padding: 26, maxWidth: 400, textAlign: "center" }}>
          <div className="sur-titre">Espace élève</div>
          <h1 style={{ fontSize: 19, marginTop: 8 }}>Go Permis 225</h1>
          <p className="faible" style={{ marginTop: 10 }}>
            {erreurLien ??
              "Ouvrez le lien personnel que votre auto-école vous a envoyé par WhatsApp."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "18px 16px 40px" }}>
      <header className="ligne-flex espace" style={{ marginBottom: 16 }}>
        <div>
          <div className="sur-titre">Espace élève</div>
          <h1>{donnees?.ecole.nom ?? "Mon suivi"}</h1>
        </div>
        <button type="button" className="bouton doux" onClick={deconnecter}>Quitter</button>
      </header>

      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && (
        <div style={{ display: "grid", gap: 12 }}>
          <Bloc>
            <div className="ligne-flex espace">
              <div>
                <h2>{donnees.eleve.prenoms} {donnees.eleve.nom}</h2>
                <div className="mono faible">
                  {donnees.eleve.matricule} · Permis {donnees.eleve.categorie}
                </div>
              </div>
              <JetonStatutEleve statut={donnees.eleve.statut} />
            </div>
          </Bloc>

          <Bloc titre="Ma progression">
            <LigneProgression
              libelle="Conduite"
              fait={donnees.progression.heuresConduiteFaites}
              prevu={donnees.progression.heuresConduitePrevues}
            />
            <LigneProgression
              libelle="Code"
              fait={donnees.progression.heuresCodeFaites}
              prevu={donnees.progression.heuresCodePrevues}
            />
            <div className="ligne-flex" style={{ gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              <span className="faible">
                Examen code : <strong>{LIBELLE_RESULTAT[donnees.eleve.resultatCode]}</strong>
              </span>
              <span className="faible">
                Conduite : <strong>{LIBELLE_RESULTAT[donnees.eleve.resultatConduite]}</strong>
              </span>
              {donnees.eleve.datePermis && (
                <span className="faible">
                  Permis obtenu le <strong>{fDate(donnees.eleve.datePermis)}</strong>
                </span>
              )}
            </div>
            {donnees.progression.pretPourExamen && (
              <Avis ton="succes">
                Vos heures sont terminées — vous pouvez être présenté à l'examen.
              </Avis>
            )}
          </Bloc>

          <Bloc titre="Mon solde">
            <div className="ligne-flex espace">
              <div>
                <div className="faible">Frais de formation</div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>
                  {fFCFA(donnees.solde.montantTotal)}
                </div>
              </div>
              <div>
                <div className="faible">Déjà versé</div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 600, color: "var(--vert)" }}>
                  {fFCFA(donnees.solde.totalPaye)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="faible">Reste à payer</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 17, fontWeight: 600,
                    color: donnees.solde.reste > 0 ? "var(--orange)" : "var(--vert)",
                  }}
                >
                  {fFCFA(donnees.solde.reste)}
                </div>
              </div>
            </div>
            {donnees.ecole.telephone && donnees.solde.reste > 0 && (
              <a className="bouton doux large" style={{ marginTop: 12 }} href={`tel:${donnees.ecole.telephone}`}>
                Appeler l'auto-école
              </a>
            )}
          </Bloc>

          <Bloc titre="Mes prochaines séances" sansPadding>
            {(() => {
              const prochaines = donnees.seances.filter(
                (s) => s.statut === "planifiee" && new Date(s.debut) >= new Date(),
              );
              if (prochaines.length === 0) {
                return <Desert glyphe="◰">Aucune séance planifiée pour le moment.</Desert>;
              }
              return (
                <Grille
                  colonnes={[
                    { cle: "quand", libelle: "Date" },
                    { cle: "type", libelle: "Type" },
                    { cle: "mon", libelle: "Moniteur" },
                    { cle: "lieu", libelle: "Rendez-vous" },
                  ]}
                >
                  {prochaines.map((s) => (
                    <tr key={s.id}>
                      <td className="num">{fDateHeure(s.debut)}</td>
                      <td>{LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}</td>
                      <td>{s.moniteur || "—"}</td>
                      <td className="faible">{s.lieu || "—"}</td>
                    </tr>
                  ))}
                </Grille>
              );
            })()}
          </Bloc>

          <Bloc titre="Historique des séances" sansPadding>
            {donnees.seances.length === 0 ? (
              <Desert glyphe="◰">Aucune séance enregistrée.</Desert>
            ) : (
              <Grille
                colonnes={[
                  { cle: "quand", libelle: "Date" },
                  { cle: "type", libelle: "Type" },
                  { cle: "duree", libelle: "Durée" },
                  { cle: "statut", libelle: "Statut", droite: true },
                ]}
              >
                {donnees.seances.slice().reverse().slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <td className="num">{fDateHeure(s.debut)}</td>
                    <td>{LIBELLE_TYPE_SEANCE[s.type]}</td>
                    <td className="num">{fDuree(s.debut, s.fin)}</td>
                    <td className="droite"><JetonStatutSeance statut={s.statut} /></td>
                  </tr>
                ))}
              </Grille>
            )}
          </Bloc>

          <Bloc titre="Mes versements" sansPadding>
            {donnees.paiements.length === 0 ? (
              <Desert glyphe="◳">Aucun versement enregistré.</Desert>
            ) : (
              <Grille
                colonnes={[
                  { cle: "recu", libelle: "Reçu" },
                  { cle: "date", libelle: "Date" },
                  { cle: "moyen", libelle: "Moyen" },
                  { cle: "montant", libelle: "Montant", droite: true },
                ]}
              >
                {donnees.paiements.map((p) => (
                  <tr key={p.numeroRecu}>
                    <td className="num">{p.numeroRecu}</td>
                    <td className="num">{fDate(p.date)}</td>
                    <td><span className="jeton orange">{LIBELLE_MOYEN[p.moyen]}</span></td>
                    <td className="num droite">{fFCFA(p.montant)}</td>
                  </tr>
                ))}
              </Grille>
            )}
          </Bloc>
        </div>
      )}
    </div>
  );
}

function LigneProgression({
  libelle, fait, prevu,
}: { libelle: string; fait: number; prevu: number }) {
  const pct = prevu === 0 ? 100 : Math.min(100, Math.round((fait / prevu) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="ligne-flex espace" style={{ marginBottom: 4 }}>
        <span className="faible">{libelle} · {fait}/{prevu} h</span>
        <span className="mono faible">{pct} %</span>
      </div>
      <Barre pourcentage={pct} />
    </div>
  );
}
