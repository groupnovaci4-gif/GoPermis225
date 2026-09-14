/** Dossier d'un élève : progression, situation financière, paiements, séances. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, nouvelOpId } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Barre, Bloc, Champ, Chargement, Desert, Grille, Initiales,
  JetonStatutEleve, JetonStatutSeance, Volet,
} from "../components/ui";
import {
  LIBELLE_MOYEN, LIBELLE_RESULTAT, LIBELLE_STATUT_ELEVE, LIBELLE_TYPE_SEANCE,
  aujourdhuiISO, fDate, fDateHeure, fDuree, fFCFA, lienPortail, lienWhatsApp,
} from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type {
  Eleve, MoyenPaiement, Paiement, Progression, Seance, Solde, StatutEleve,
} from "../types";

interface Dossier {
  eleve: Eleve;
  solde: Solde;
  progression: Progression;
  paiements: Paiement[];
  seances: Seance[];
}

export default function EleveDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { peutGerer, estDirecteur } = useSession();
  const [volet, setVolet] = useState<"paiement" | "statut" | "lien" | null>(null);
  const [lienGenere, setLienGenere] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"paiements" | "seances">("paiements");

  const { donnees, chargement, erreur, recharger } = useChargement<Dossier>(
    () => api.get<Dossier>(`/api/eleves/${id}`),
    [id],
  );

  const e = donnees?.eleve;

  return (
    <Atelier
      titre={e ? `${e.prenoms} ${e.nom}` : "Dossier élève"}
      sous={e ? `${e.matricule}${e.cni ? ` · CNI ${e.cni}` : ""}${e.commune ? ` · ${e.commune}` : ""}` : undefined}
      outils={
        <>
          <button type="button" className="bouton doux" onClick={() => navigate("/eleves")}>
            Retour
          </button>
          {peutGerer && (
            <button type="button" className="bouton" onClick={() => setVolet("paiement")}>
              Encaisser
            </button>
          )}
        </>
      }
    >
      {chargement && <Chargement lignes={5} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && e && (
        <>
          <div className="rangs-2">
            <Bloc titre="Dossier">
              <div className="ligne-flex" style={{ gap: 11, marginBottom: 12 }}>
                <Initiales nom={e.nom} prenoms={e.prenoms} />
                <div>
                  <div style={{ fontWeight: 650 }}>{e.prenoms} {e.nom}</div>
                  <div className="mono faible">{e.telephone}</div>
                </div>
                <span style={{ marginLeft: "auto" }}><JetonStatutEleve statut={e.statut} /></span>
              </div>

              <DetailLigne libelle="Catégorie" valeur={`Permis ${e.categorie}`} />
              <DetailLigne libelle="Inscrit le" valeur={fDate(e.dateInscription)} />
              <DetailLigne libelle="Examen code" valeur={LIBELLE_RESULTAT[e.resultatCode]} />
              <DetailLigne libelle="Examen conduite" valeur={LIBELLE_RESULTAT[e.resultatConduite]} />
              {e.telephoneTuteur && <DetailLigne libelle="Tuteur" valeur={e.telephoneTuteur} />}

              <div className="ligne-flex" style={{ gap: 7, marginTop: 14, flexWrap: "wrap" }}>
                <a className="bouton doux" href={`tel:${e.telephone}`}>Appeler</a>
                <a
                  className="bouton doux"
                  href={lienWhatsApp(e.telephone, `Bonjour ${e.prenoms},`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                {peutGerer && (
                  <>
                    <button type="button" className="bouton doux" onClick={() => setVolet("statut")}>
                      Changer le statut
                    </button>
                    <button type="button" className="bouton doux" onClick={() => setVolet("lien")}>
                      Lien de suivi
                    </button>
                  </>
                )}
              </div>
            </Bloc>

            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <Bloc titre="Progression">
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
                {donnees.progression.pretPourExamen && (
                  <Avis ton="succes">Heures terminées — l'élève peut être présenté à l'examen.</Avis>
                )}
              </Bloc>

              <Bloc titre="Situation financière">
                <div className="ligne-flex espace" style={{ marginBottom: 6 }}>
                  <div>
                    <div className="faible">Frais</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
                      {fFCFA(donnees.solde.montantTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="faible">Réglé</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--vert)" }}>
                      {fFCFA(donnees.solde.totalPaye)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="faible">Solde</div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 16, fontWeight: 600,
                        color: donnees.solde.reste > 0 ? "var(--orange)" : "var(--vert)",
                      }}
                    >
                      {fFCFA(donnees.solde.reste)}
                    </div>
                  </div>
                </div>
                <Barre
                  pourcentage={donnees.solde.tauxRecouvrement}
                  ton={donnees.solde.tauxRecouvrement < 50 ? "orange" : undefined}
                />
                {donnees.solde.tropPercu > 0 && (
                  <Avis ton="alerte">
                    Trop-perçu de {fFCFA(donnees.solde.tropPercu)} — à vérifier en caisse.
                  </Avis>
                )}
                {donnees.solde.reste > 0 && (
                  <a
                    className="bouton doux large"
                    style={{ marginTop: 10 }}
                    href={lienWhatsApp(
                      e.telephone,
                      `Bonjour ${e.prenoms}, il reste ${donnees.solde.reste} FCFA à régler pour votre formation. Merci de passer à l'auto-école.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Relancer par WhatsApp
                  </a>
                )}
              </Bloc>
            </div>
          </div>

          <div className="filtres">
            <button
              type="button"
              className={`puce${onglet === "paiements" ? " actif" : ""}`}
              onClick={() => setOnglet("paiements")}
            >
              Paiements ({donnees.paiements.length})
            </button>
            <button
              type="button"
              className={`puce${onglet === "seances" ? " actif" : ""}`}
              onClick={() => setOnglet("seances")}
            >
              Séances ({donnees.seances.length})
            </button>
          </div>

          <Bloc sansPadding>
            {onglet === "paiements" ? (
              donnees.paiements.length === 0 ? (
                <Desert glyphe="◳">Aucun versement enregistré.</Desert>
              ) : (
                <Grille
                  colonnes={[
                    { cle: "recu", libelle: "Reçu" },
                    { cle: "date", libelle: "Date" },
                    { cle: "moyen", libelle: "Moyen" },
                    { cle: "montant", libelle: "Montant", droite: true },
                    ...(estDirecteur ? [{ cle: "act", libelle: "", droite: true }] : []),
                  ]}
                >
                  {donnees.paiements.map((p) => (
                    <tr key={p.id}>
                      <td className="num">{p.numeroRecu}</td>
                      <td className="num">{fDate(p.date)}</td>
                      <td><span className="jeton orange">{LIBELLE_MOYEN[p.moyen]}</span></td>
                      <td className="num droite">{fFCFA(p.montant)}</td>
                      {estDirecteur && (
                        <td className="droite">
                          <button
                            type="button"
                            className="bouton nu"
                            onClick={async () => {
                              if (!confirm(`Annuler définitivement le reçu ${p.numeroRecu} ?`)) return;
                              await api.delete(`/api/paiements/${p.id}`);
                              recharger();
                            }}
                          >
                            Annuler
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </Grille>
              )
            ) : donnees.seances.length === 0 ? (
              <Desert glyphe="◰">Aucune séance planifiée.</Desert>
            ) : (
              <Grille
                colonnes={[
                  { cle: "date", libelle: "Date" },
                  { cle: "type", libelle: "Type" },
                  { cle: "duree", libelle: "Durée" },
                  { cle: "motif", libelle: "Motif" },
                  { cle: "statut", libelle: "Statut", droite: true },
                ]}
              >
                {donnees.seances.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{fDateHeure(s.debut)}</td>
                    <td>{LIBELLE_TYPE_SEANCE[s.type]}</td>
                    <td className="num">{fDuree(s.debut, s.fin)}</td>
                    <td className="faible">{s.motif || "—"}</td>
                    <td className="droite"><JetonStatutSeance statut={s.statut} /></td>
                  </tr>
                ))}
              </Grille>
            )}
          </Bloc>

          {(e.historiqueStatuts ?? []).length > 0 && (
            <Bloc titre="Historique du dossier" sansPadding>
              <Grille
                colonnes={[
                  { cle: "quand", libelle: "Date" },
                  { cle: "statut", libelle: "Statut" },
                  { cle: "motif", libelle: "Motif" },
                ]}
              >
                {(e.historiqueStatuts ?? []).slice().reverse().map((h, i) => (
                  <tr key={i}>
                    <td className="num">{fDateHeure(h.horodatage)}</td>
                    <td>{LIBELLE_STATUT_ELEVE[h.statut]}</td>
                    <td className="faible">{h.motif || "—"}</td>
                  </tr>
                ))}
              </Grille>
            </Bloc>
          )}
        </>
      )}

      {volet === "paiement" && donnees && (
        <VoletPaiement
          eleve={donnees.eleve}
          reste={donnees.solde.reste}
          onFermer={() => setVolet(null)}
          onEnregistre={() => { setVolet(null); recharger(); }}
        />
      )}

      {volet === "statut" && donnees && (
        <VoletStatut
          statutActuel={donnees.eleve.statut}
          eleveId={donnees.eleve.id}
          onFermer={() => setVolet(null)}
          onEnregistre={() => { setVolet(null); recharger(); }}
        />
      )}

      {volet === "lien" && donnees && e && (
        <Volet
          titre="Lien de suivi de l'élève"
          onFermer={() => { setVolet(null); setLienGenere(null); }}
        >
          <p className="faible">
            Générer un nouveau lien invalide immédiatement le précédent. Utile si
            l'élève a changé de téléphone ou si le lien a circulé.
          </p>
          {lienGenere ? (
            <>
              <input readOnly value={lienGenere} onFocus={(ev) => ev.target.select()} />
              <a
                className="bouton large"
                style={{ marginTop: 10 }}
                href={lienWhatsApp(
                  e.telephone,
                  `Bonjour ${e.prenoms}, voici votre espace de suivi : ${lienGenere}`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Envoyer par WhatsApp
              </a>
            </>
          ) : (
            <button
              type="button"
              className="bouton large"
              onClick={async () => {
                const reponse = await api.post<{ portailJeton: string }>(
                  `/api/eleves/${e.id}/lien-portail`,
                );
                setLienGenere(lienPortail(reponse.portailJeton));
              }}
            >
              Générer un nouveau lien
            </button>
          )}
        </Volet>
      )}
    </Atelier>
  );
}

function DetailLigne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div
      className="ligne-flex espace"
      style={{ padding: "5px 0", borderBottom: "1px solid var(--bordure)" }}
    >
      <span className="faible">{libelle}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{valeur}</span>
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

function VoletPaiement({
  eleve, reste, onFermer, onEnregistre,
}: { eleve: Eleve; reste: number; onFermer: () => void; onEnregistre: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState<MoyenPaiement>("especes");
  const [date, setDate] = useState(aujourdhuiISO());
  const [reference, setReference] = useState("");
  // Généré une seule fois par ouverture : c'est ce qui rend l'envoi idempotent
  // si l'utilisateur valide deux fois.
  const [opId] = useState(nouvelOpId);

  const valeur = Number(montant) || 0;

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.post("/api/paiements", {
        eleveId: eleve.id, montant: valeur, moyen, date, reference, clientOpId: opId,
      });
    });
    if (ok) onEnregistre();
  }

  return (
    <Volet titre="Enregistrer un versement" onFermer={onFermer}>
      <p className="faible">
        {eleve.prenoms} {eleve.nom} — solde <strong className="mono">{fFCFA(reste)}</strong>
      </p>
      <form onSubmit={soumettre}>
        <Champ etiquette="Montant reçu (FCFA)">
          <input
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            required
            autoFocus
            placeholder="25000"
          />
        </Champ>
        {reste > 0 && (
          <div className="ligne-flex" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button type="button" className="bouton doux" onClick={() => setMontant(String(reste))}>
              Solde entier
            </button>
            <button
              type="button"
              className="bouton doux"
              onClick={() => setMontant(String(Math.round(reste / 2)))}
            >
              Moitié
            </button>
          </div>
        )}
        <Champ etiquette="Moyen de paiement">
          <select value={moyen} onChange={(e) => setMoyen(e.target.value as MoyenPaiement)}>
            {(Object.keys(LIBELLE_MOYEN) as MoyenPaiement[]).map((m) => (
              <option key={m} value={m}>{LIBELLE_MOYEN[m]}</option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Champ>
        {moyen !== "especes" && (
          <Champ etiquette="Référence de la transaction" aide="Numéro fourni par l'opérateur">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
          </Champ>
        )}

        {valeur > reste && reste > 0 && (
          <Avis ton="alerte">Ce montant dépasse le solde de {fFCFA(valeur - reste)}.</Avis>
        )}
        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || valeur <= 0}>
            {envoi ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </form>
    </Volet>
  );
}

function VoletStatut({
  statutActuel, eleveId, onFermer, onEnregistre,
}: {
  statutActuel: StatutEleve; eleveId: string;
  onFermer: () => void; onEnregistre: () => void;
}) {
  const { envoi, erreur, executer } = useEnvoi();
  const [statut, setStatut] = useState<StatutEleve>(statutActuel);
  const [motif, setMotif] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.post(`/api/eleves/${eleveId}/statut`, { statut, motif });
    });
    if (ok) onEnregistre();
  }

  return (
    <Volet titre="Changer le statut" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Nouveau statut">
          <select value={statut} onChange={(e) => setStatut(e.target.value as StatutEleve)}>
            {(Object.keys(LIBELLE_STATUT_ELEVE) as StatutEleve[]).map((s) => (
              <option key={s} value={s} disabled={s === statutActuel}>
                {LIBELLE_STATUT_ELEVE[s]}{s === statutActuel ? " (actuel)" : ""}
              </option>
            ))}
          </select>
        </Champ>
        <Champ
          etiquette="Motif"
          aide="Conservé dans l'historique du dossier — utile en cas de contestation."
        >
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={2000} />
        </Champ>

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || statut === statutActuel}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Volet>
  );
}
