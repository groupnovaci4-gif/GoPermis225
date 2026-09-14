/** Accueil du directeur : l'état de l'école en 30 secondes. */

import { Link } from "react-router-dom";

import { api } from "../api";
import { Carte, Chargement, Jauge, Message, Tuile, Vide } from "../components/ui";
import { fCompact, fDate, fFCFA } from "../format";
import { useChargement } from "../hooks";
import { useSession } from "../session";
import type { TableauBord as DonneesBord } from "../types";

export default function TableauBord() {
  const { session, deconnecter } = useSession();
  const { donnees, chargement, erreur } = useChargement<DonneesBord>(
    () => api.get<DonneesBord>("/api/tableau-bord"),
  );

  return (
    <>
      <header className="entete">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{session?.ecole?.nom ?? "Mon auto-école"}</h1>
          <div className="sous">{session?.utilisateur?.nom}</div>
        </div>
        <button type="button" className="bouton doux petit" onClick={deconnecter}>
          Quitter
        </button>
      </header>

      <main className="contenu">
        {chargement && <Chargement lignes={4} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        {donnees && (
          <>
            <div className="grille">
              <Tuile
                libelle="Élèves actifs"
                valeur={donnees.kpis.elevesActifs}
                detail={`${donnees.kpis.elevesTotal} au total`}
              />
              <Tuile
                libelle="Encaissé ce jour"
                valeur={fCompact(donnees.kpis.encaisseJour)}
                detail="FCFA"
                ton="vert"
              />
              <Tuile
                libelle="Reste à recouvrer"
                valeur={fCompact(donnees.kpis.resteARecouvrer)}
                detail="FCFA"
                ton={donnees.kpis.resteARecouvrer > 0 ? "orange" : undefined}
              />
              <Tuile
                libelle="Taux de réussite"
                valeur={`${donnees.kpis.tauxReussite} %`}
                detail={`${donnees.kpis.diplomes} diplômés`}
              />
            </div>

            <Carte titre="Résultat du mois">
              <div className="rangee espace">
                <span className="doux">Recettes</span>
                <strong className="nombre">{fFCFA(donnees.kpis.encaisseMois)}</strong>
              </div>
              <div className="rangee espace">
                <span className="doux">Dépenses</span>
                <strong className="nombre">− {fFCFA(donnees.kpis.depensesMois)}</strong>
              </div>
              <div
                className="rangee espace"
                style={{ borderTop: "1px solid var(--bordure)", marginTop: 8, paddingTop: 8 }}
              >
                <strong>Bénéfice</strong>
                <strong
                  className="nombre"
                  style={{ color: donnees.kpis.beneficeMois >= 0 ? "var(--vert)" : "var(--rouge)" }}
                >
                  {fFCFA(donnees.kpis.beneficeMois)}
                </strong>
              </div>
            </Carte>

            <Carte titre="Revenus des 12 derniers mois">
              <GraphiqueRevenus donnees={donnees.revenusParMois} />
            </Carte>

            <Carte
              titre={`Prêts pour l'examen (${donnees.elevesPretsExamen.length})`}
              action={<Link to="/eleves">Tous les élèves</Link>}
            >
              {donnees.elevesPretsExamen.length === 0 ? (
                <p className="doux">
                  Aucun élève n'a terminé ses heures de code et de conduite.
                </p>
              ) : (
                <div className="liste">
                  {donnees.elevesPretsExamen.slice(0, 6).map((e) => (
                    <Link
                      key={e.eleveId}
                      to={`/eleves/${e.eleveId}`}
                      className="ligne"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="corps">
                        <div className="principal">{e.prenoms} {e.nom}</div>
                        <div className="secondaire">{e.matricule}</div>
                      </div>
                      <div className="droite doux">
                        {e.heuresCodeFaites} h code · {e.heuresConduiteFaites} h conduite
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Carte>

            <Carte
              titre="Moniteurs"
              action={<Link to="/personnel">Gérer</Link>}
            >
              {donnees.performanceMoniteurs.length === 0 ? (
                <Vide icone="👨‍🏫">Aucun moniteur enregistré.</Vide>
              ) : (
                <div className="liste">
                  {donnees.performanceMoniteurs.map((m) => (
                    <div key={m.moniteurId} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">{m.nom}</div>
                        <div className="secondaire">
                          {m.elevesFormes} élève{m.elevesFormes > 1 ? "s" : ""} ·{" "}
                          {m.heures} h effectuées
                        </div>
                        <div style={{ marginTop: 6, maxWidth: 180 }}>
                          <Jauge pourcentage={m.tauxReussite} />
                        </div>
                      </div>
                      <div className="droite">
                        <div><strong>{m.tauxReussite} %</strong></div>
                        <div className="faible">{fFCFA(m.montant)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>

            <Carte
              titre={`Alertes véhicules (${donnees.alertesVehicules.length})`}
              action={<Link to="/vehicules">Le parc</Link>}
            >
              {donnees.alertesVehicules.length === 0 ? (
                <p className="doux">Aucune échéance à surveiller dans les 30 jours.</p>
              ) : (
                <div className="liste">
                  {donnees.alertesVehicules.map((a, i) => (
                    <div key={`${a.vehiculeId}-${a.champ}-${i}`} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">{a.immatriculation}</div>
                        <div className="secondaire">
                          {a.libelle} · {fDate(a.echeance)}
                        </div>
                      </div>
                      <div className="droite">
                        <span className={`badge ${a.niveau === "expire" ? "rouge" : "orange"}`}>
                          {a.niveau === "expire"
                            ? `Expiré depuis ${Math.abs(a.jours)} j`
                            : `Dans ${a.jours} j`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>
          </>
        )}
      </main>
    </>
  );
}

/** Histogramme simple en CSS : pas de librairie pour douze barres. */
function GraphiqueRevenus({
  donnees,
}: { donnees: { libelle: string; montant: number }[] }) {
  const maximum = Math.max(1, ...donnees.map((d) => d.montant));
  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}
      role="img"
      aria-label={`Revenus mensuels : ${donnees
        .map((d) => `${d.libelle} ${d.montant} FCFA`)
        .join(", ")}`}
    >
      {donnees.map((d) => (
        <div key={d.libelle} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div
            title={`${d.libelle} — ${fFCFA(d.montant)}`}
            style={{
              height: `${Math.round((d.montant / maximum) * 84)}px`,
              minHeight: 2,
              background: d.montant > 0 ? "var(--vert)" : "var(--bordure)",
              borderRadius: "4px 4px 0 0",
            }}
          />
          <div className="faible" style={{ fontSize: 9, marginTop: 3 }}>
            {d.libelle.slice(0, 2)}
          </div>
        </div>
      ))}
    </div>
  );
}
