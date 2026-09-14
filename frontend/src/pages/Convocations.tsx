/** Convocations CGI : fiches de présentation au centre d'examen.
 *
 * Une fiche est établie dès qu'un élève atteint 80 % de ses heures de
 * conduite. Le seuil est délibérément en deçà de la fin de formation : le
 * dossier circule, il ne s'établit pas la veille de l'épreuve.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api, telecharger } from "../api";
import { Atelier } from "../components/Atelier";
import { Avis, Bloc, Chargement, Desert, Grille, Jeton } from "../components/ui";
import { fDate } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Convocation } from "../types";

const LIBELLE_EPREUVE = {
  code: "Code de la route",
  conduite: "Conduite pratique",
} as const;

export default function Convocations() {
  const { peutGerer } = useSession();
  const { envoi, erreur: erreurVerif, executer } = useEnvoi();
  const [resultat, setResultat] = useState<string | null>(null);

  const { donnees, chargement, erreur, recharger } = useChargement<Convocation[]>(
    () => api.get<Convocation[]>("/api/convocations"), [],
  );

  async function verifier() {
    setResultat(null);
    const ok = await executer(async () => {
      const reponse = await api.post<{ creees: number; seuil: number }>(
        "/api/convocations/verifier",
      );
      setResultat(
        reponse.creees === 0
          ? `Aucun nouvel élève n'atteint le seuil de ${reponse.seuil} % des heures de conduite.`
          : `${reponse.creees} fiche(s) établie(s).`,
      );
    });
    if (ok) recharger();
  }

  return (
    <Atelier
      titre="Convocations CGI"
      sous={
        donnees
          ? `${donnees.length} fiche(s) — établies dès 80 % des heures de conduite`
          : undefined
      }
      outils={
        peutGerer ? (
          <button type="button" className="bouton doux" onClick={verifier} disabled={envoi}>
            {envoi ? "Vérification…" : "↻ Vérifier les éligibles"}
          </button>
        ) : undefined
      }
    >
      <div className="bandeau-info">
        <span className="glyphe" aria-hidden="true">◈</span>
        <div>
          <div className="titre">Établissement des fiches</div>
          <p>
            Dès qu'un élève atteint 80 % de ses heures de conduite validées, sa
            fiche de présentation peut être établie. Le PDF est prêt à imprimer,
            signer et présenter au centre d'examen avec une pièce d'identité.
            Relancer la vérification ne crée jamais de doublon.
          </p>
        </div>
      </div>

      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}
      {erreurVerif && <Avis ton="erreur">{erreurVerif}</Avis>}
      {resultat && <Avis ton="succes">{resultat}</Avis>}

      {donnees && (
        <Bloc sansPadding>
          {donnees.length === 0 ? (
            <Desert glyphe="◈">
              Aucune fiche établie. Lancez « Vérifier les éligibles » quand des
              élèves approchent de la fin de leurs heures.
            </Desert>
          ) : (
            <Grille
              colonnes={[
                { cle: "ref", libelle: "Référence" },
                { cle: "eleve", libelle: "Élève" },
                { cle: "epreuve", libelle: "Épreuve" },
                { cle: "progression", libelle: "Progression", droite: true },
                { cle: "etablie", libelle: "Établie le", droite: true },
                { cle: "doc", libelle: "Document", droite: true },
              ]}
            >
              {donnees.map((c) => (
                <tr key={c.id}>
                  <td className="num">{c.reference}</td>
                  <td>
                    <Link
                      to={`/eleves/${c.eleveId}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <span className="nom-primaire">{c.eleveNom || "—"}</span>
                    </Link>
                  </td>
                  <td><Jeton ton="bleu">{LIBELLE_EPREUVE[c.epreuve]}</Jeton></td>
                  <td className="num droite">{c.progression} %</td>
                  <td className="num droite">{fDate(c.creeLe)}</td>
                  <td className="droite">
                    <button
                      type="button"
                      className="bouton nu"
                      onClick={() =>
                        telecharger(`/api/convocations/${c.id}/document`, `${c.reference}.pdf`)
                      }
                    >
                      ⭳ PDF
                    </button>
                  </td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
      )}
    </Atelier>
  );
}
