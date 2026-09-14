/** Tableau de bord du directeur : l'état de l'école en un écran. */

import { Link } from "react-router-dom";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import { Avis, Barre, Bloc, Chargement, Desert, Grille, Indicateur } from "../components/ui";
import { fDate, fFCFA } from "../format";
import { useChargement } from "../hooks";
import type { TableauBord as DonneesBord } from "../types";

const AUJOURDHUI = new Date().toLocaleDateString("fr-FR", {
  weekday: "long", day: "numeric", month: "long",
});

export default function TableauBord() {
  const { donnees, chargement, erreur } = useChargement<DonneesBord>(
    () => api.get<DonneesBord>("/api/tableau-bord"),
  );

  return (
    <Atelier
      titre="Tableau de bord"
      sous={AUJOURDHUI}
      outils={<Link to="/comptabilite" className="bouton">Encaisser</Link>}
    >
      {chargement && <Chargement lignes={5} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && (
        <>
          <div className="rangs">
            <Indicateur
              glyphe="◲"
              libelle="Élèves actifs"
              valeur={donnees.kpis.elevesActifs}
              note={`${donnees.kpis.elevesTotal} dossiers au total`}
            />
            <Indicateur
              glyphe="◳"
              ton="vert"
              libelle="Recettes du jour"
              valeur={fFCFA(donnees.kpis.encaisseJour)}
              note={`${fFCFA(donnees.kpis.encaisseMois)} ce mois`}
            />
            <Indicateur
              glyphe="↗"
              ton={donnees.kpis.resteARecouvrer > 0 ? "orange" : undefined}
              libelle="Créances ouvertes"
              valeur={fFCFA(donnees.kpis.resteARecouvrer)}
              note="Soldes élèves restant à encaisser"
            />
            <Indicateur
              glyphe="✓"
              libelle="Taux de réussite"
              valeur={`${donnees.kpis.tauxReussite} %`}
              note={`${donnees.kpis.diplomes} permis obtenus`}
            />
          </div>

          <div className="rangs-3">
            <Indicateur
              glyphe="◰"
              libelle="Séances aujourd'hui"
              valeur={donnees.kpis.seancesJour}
            />
            <Indicateur
              glyphe="↘"
              ton="rouge"
              libelle="Dépenses du mois"
              valeur={fFCFA(donnees.kpis.depensesMois)}
              note={`Bénéfice : ${fFCFA(donnees.kpis.beneficeMois)}`}
            />
            <Indicateur
              glyphe="⚠"
              ton={donnees.alertesVehicules.length ? "orange" : undefined}
              libelle="Alertes flotte"
              valeur={donnees.alertesVehicules.length}
              note="Assurance / visite technique"
            />
          </div>

          <div className="rangs-2">
            <Bloc titre="Recettes — évolution sur 12 mois">
              <Courbe donnees={donnees.revenusParMois} />
            </Bloc>

            <Bloc
              titre={`Examens — prêts à passer (${donnees.elevesPretsExamen.length})`}
              action={<Link to="/eleves" className="lien-fiche">Tous les élèves</Link>}
            >
              {donnees.elevesPretsExamen.length === 0 ? (
                <Desert glyphe="◷">
                  Aucun élève n'a encore terminé ses heures de code et de conduite.
                </Desert>
              ) : (
                <div>
                  {donnees.elevesPretsExamen.slice(0, 6).map((e) => (
                    <Link
                      key={e.eleveId}
                      to={`/eleves/${e.eleveId}`}
                      className="ligne-flex"
                      style={{
                        padding: "8px 0", gap: 12,
                        borderBottom: "1px solid var(--bordure)",
                        textDecoration: "none", color: "inherit",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {e.prenoms} {e.nom}
                        </div>
                        <Barre pourcentage={e.pourcentage} />
                      </div>
                      <span className="mono faible">{e.pourcentage} %</span>
                    </Link>
                  ))}
                </div>
              )}
            </Bloc>
          </div>

          <Bloc titre="Moniteurs — performance et rémunération" sansPadding>
            {donnees.performanceMoniteurs.length === 0 ? (
              <Desert glyphe="◵">Aucun moniteur enregistré.</Desert>
            ) : (
              <Grille
                colonnes={[
                  { cle: "nom", libelle: "Moniteur" },
                  { cle: "eleves", libelle: "Élèves formés", droite: true },
                  { cle: "taux", libelle: "Réussite", droite: true },
                  { cle: "heures", libelle: "Heures", droite: true },
                  { cle: "paie", libelle: "Rémunération", droite: true },
                ]}
              >
                {donnees.performanceMoniteurs.map((m) => (
                  <tr key={m.moniteurId}>
                    <td className="nom-primaire">{m.nom}</td>
                    <td className="num droite">{m.elevesFormes}</td>
                    <td className="num droite">{m.tauxReussite} %</td>
                    <td className="num droite">{m.heures} h</td>
                    <td className="num droite">{fFCFA(m.montant)}</td>
                  </tr>
                ))}
              </Grille>
            )}
          </Bloc>

          {donnees.alertesVehicules.length > 0 && (
            <Bloc
              titre={`Flotte — échéances à surveiller (${donnees.alertesVehicules.length})`}
              action={<Link to="/flotte" className="lien-fiche">Le parc</Link>}
              sansPadding
            >
              <Grille
                colonnes={[
                  { cle: "immat", libelle: "Véhicule" },
                  { cle: "quoi", libelle: "Document" },
                  { cle: "quand", libelle: "Échéance" },
                  { cle: "etat", libelle: "", droite: true },
                ]}
              >
                {donnees.alertesVehicules.map((a, i) => (
                  <tr key={`${a.vehiculeId}-${a.champ}-${i}`}>
                    <td className="nom-primaire mono">{a.immatriculation}</td>
                    <td>{a.libelle}</td>
                    <td className="num">{fDate(a.echeance)}</td>
                    <td className="droite">
                      <span className={`jeton ${a.niveau === "expire" ? "rouge" : "orange"}`}>
                        {a.niveau === "expire"
                          ? `Expiré depuis ${Math.abs(a.jours)} j`
                          : `Dans ${a.jours} j`}
                      </span>
                    </td>
                  </tr>
                ))}
              </Grille>
            </Bloc>
          )}
        </>
      )}
    </Atelier>
  );
}

/** Courbe d'aire en SVG — douze points ne justifient pas une librairie. */
function Courbe({ donnees }: { donnees: { libelle: string; montant: number }[] }) {
  const L = 560;
  const H = 150;
  const marge = { haut: 10, bas: 22, gauche: 4, droite: 4 };
  const maximum = Math.max(1, ...donnees.map((d) => d.montant));
  const largeurUtile = L - marge.gauche - marge.droite;
  const hauteurUtile = H - marge.haut - marge.bas;

  const points = donnees.map((d, i) => {
    const x = marge.gauche + (i * largeurUtile) / Math.max(1, donnees.length - 1);
    const y = marge.haut + hauteurUtile - (d.montant / maximum) * hauteurUtile;
    return { x, y, ...d };
  });

  const trace = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const aire = `${trace} L${points[points.length - 1]?.x.toFixed(1)},${(marge.haut + hauteurUtile).toFixed(1)} L${points[0]?.x.toFixed(1)},${(marge.haut + hauteurUtile).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      style={{ width: "100%", height: 150 }}
      role="img"
      aria-label={`Recettes mensuelles : ${donnees.map((d) => `${d.libelle} ${d.montant} FCFA`).join(", ")}`}
    >
      <defs>
        <linearGradient id="degradeRecettes" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--vert)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--vert)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={aire} fill="url(#degradeRecettes)" />
      <path d={trace} fill="none" stroke="var(--vert)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <text
          key={p.libelle}
          x={p.x}
          y={H - 6}
          textAnchor="middle"
          fontSize="9"
          fill="var(--texte-faible)"
        >
          {p.libelle.slice(0, 2)}
        </text>
      ))}
    </svg>
  );
}
