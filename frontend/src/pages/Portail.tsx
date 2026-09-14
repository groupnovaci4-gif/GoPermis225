/** Portail élève : consultation de son propre dossier, sans installation.
 *
 * L'élève arrive par un lien WhatsApp contenant son jeton. On l'échange
 * aussitôt contre un jeton de session, puis on nettoie l'URL pour que le
 * jeton ne traîne ni dans l'historique du navigateur ni dans un partage
 * d'écran.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import {
  BadgeStatutEleve, BadgeStatutSeance, Carte, Chargement, Jauge, Message, Vide,
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
  const [echangeEnCours, setEchangeEnCours] = useState(Boolean(jeton));

  useEffect(() => {
    if (!jeton) return;
    let annule = false;
    connecterPortail(jeton)
      .then(() => {
        if (annule) return;
        // On remplace l'entrée d'historique : le jeton disparaît de l'URL.
        navigate("/portail", { replace: true });
      })
      .catch(() => {
        if (!annule) setErreurLien("Ce lien n'est plus valide. Demandez-en un nouveau à votre auto-école.");
      })
      .finally(() => {
        if (!annule) setEchangeEnCours(false);
      });
    return () => { annule = true; };
  }, [jeton, connecterPortail, navigate]);

  const connecte = session?.cote === "eleve";
  const { donnees, chargement, erreur } = useChargement<DossierPortail>(
    () => api.get<DossierPortail>("/api/portail"),
    [connecte],
  );

  if (echangeEnCours) {
    return <div className="pleine-page"><p className="doux centre">Ouverture de votre espace…</p></div>;
  }

  if (erreurLien || (!connecte && !jeton)) {
    return (
      <div className="pleine-page">
        <div className="carte centre">
          <div style={{ fontSize: 36 }} aria-hidden="true">🔑</div>
          <h1 style={{ fontSize: 19, marginTop: 8 }}>Espace élève</h1>
          <p className="doux" style={{ marginTop: 8 }}>
            {erreurLien ??
              "Ouvrez le lien personnel que votre auto-école vous a envoyé par WhatsApp."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ paddingBottom: 24 }}>
      <header className="entete">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{donnees?.ecole.nom ?? "Mon suivi"}</h1>
          <div className="sous">Espace élève</div>
        </div>
        <button type="button" className="bouton doux petit" onClick={deconnecter}>Quitter</button>
      </header>

      <main className="contenu">
        {chargement && <Chargement lignes={4} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        {donnees && (
          <>
            <Carte>
              <h2>{donnees.eleve.prenoms} {donnees.eleve.nom}</h2>
              <div className="doux">
                {donnees.eleve.matricule} · Permis {donnees.eleve.categorie}
              </div>
              <div style={{ marginTop: 8 }}>
                <BadgeStatutEleve statut={donnees.eleve.statut} />
              </div>
            </Carte>

            <Carte titre="Ma progression">
              <div className="rangee espace" style={{ marginBottom: 6 }}>
                <strong>{donnees.progression.pourcentage} % du parcours</strong>
                {donnees.progression.pretPourExamen && (
                  <span className="badge vert">Prêt pour l'examen</span>
                )}
              </div>
              <Jauge pourcentage={donnees.progression.pourcentage} />
              <div className="grille-3" style={{ marginTop: 12 }}>
                <div>
                  <div className="faible">Code</div>
                  <strong className="nombre">
                    {donnees.progression.heuresCodeFaites} / {donnees.progression.heuresCodePrevues} h
                  </strong>
                </div>
                <div>
                  <div className="faible">Conduite</div>
                  <strong className="nombre">
                    {donnees.progression.heuresConduiteFaites} / {donnees.progression.heuresConduitePrevues} h
                  </strong>
                </div>
                <div>
                  <div className="faible">Permis</div>
                  <strong style={{ fontSize: 13 }}>
                    {donnees.eleve.datePermis ? fDate(donnees.eleve.datePermis) : "En cours"}
                  </strong>
                </div>
              </div>
              <div className="rangee" style={{ gap: 14, marginTop: 12 }}>
                <span className="doux">
                  Examen code : <strong>{LIBELLE_RESULTAT[donnees.eleve.resultatCode]}</strong>
                </span>
                <span className="doux">
                  Conduite : <strong>{LIBELLE_RESULTAT[donnees.eleve.resultatConduite]}</strong>
                </span>
              </div>
            </Carte>

            <Carte titre="Mon solde">
              <div className="rangee espace">
                <span className="doux">Montant de la formation</span>
                <strong className="nombre">{fFCFA(donnees.solde.montantTotal)}</strong>
              </div>
              <div className="rangee espace">
                <span className="doux">Déjà versé</span>
                <strong className="nombre" style={{ color: "var(--vert)" }}>
                  {fFCFA(donnees.solde.totalPaye)}
                </strong>
              </div>
              <div
                className="rangee espace"
                style={{ borderTop: "1px solid var(--bordure)", marginTop: 8, paddingTop: 8 }}
              >
                <strong>Reste à payer</strong>
                <strong
                  className="nombre"
                  style={{ color: donnees.solde.reste > 0 ? "var(--orange)" : "var(--vert)" }}
                >
                  {fFCFA(donnees.solde.reste)}
                </strong>
              </div>
              {donnees.ecole.telephone && donnees.solde.reste > 0 && (
                <a
                  className="bouton doux large"
                  style={{ marginTop: 10 }}
                  href={`tel:${donnees.ecole.telephone}`}
                >
                  Appeler l'auto-école
                </a>
              )}
            </Carte>

            <Carte titre="Mes prochaines séances">
              {(() => {
                const prochaines = donnees.seances.filter(
                  (s) => s.statut === "planifiee" && new Date(s.debut) >= new Date(),
                );
                if (prochaines.length === 0) {
                  return <Vide icone="📅">Aucune séance planifiée pour le moment.</Vide>;
                }
                return (
                  <div className="liste">
                    {prochaines.map((s) => (
                      <div key={s.id} className="ligne" style={{ cursor: "default" }}>
                        <div className="corps">
                          <div className="principal">{fDateHeure(s.debut)}</div>
                          <div className="secondaire">
                            {LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}
                            {s.moniteur ? ` · ${s.moniteur}` : ""}
                          </div>
                          {s.lieu && <div className="faible">Rendez-vous : {s.lieu}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Carte>

            <Carte titre="Historique des séances">
              {donnees.seances.length === 0 ? (
                <p className="doux">Aucune séance enregistrée.</p>
              ) : (
                <div className="liste">
                  {donnees.seances.slice().reverse().slice(0, 20).map((s) => (
                    <div key={s.id} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">
                          {LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}
                        </div>
                        <div className="secondaire">{fDateHeure(s.debut)}</div>
                      </div>
                      <div className="droite"><BadgeStatutSeance statut={s.statut} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>

            <Carte titre="Mes versements">
              {donnees.paiements.length === 0 ? (
                <p className="doux">Aucun versement enregistré.</p>
              ) : (
                <div className="liste">
                  {donnees.paiements.map((p) => (
                    <div key={p.numeroRecu} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">{fFCFA(p.montant)}</div>
                        <div className="secondaire">
                          {fDate(p.date)} · {LIBELLE_MOYEN[p.moyen]}
                        </div>
                      </div>
                      <div className="droite faible">{p.numeroRecu}</div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>
          </>
        )}
      </main>
    </div>
  );
}
