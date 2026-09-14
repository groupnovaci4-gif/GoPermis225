/** Dossier complet d'un élève : solde, progression, paiements, séances. */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, nouvelOpId } from "../api";
import {
  BadgeStatutEleve, BadgeStatutSeance, Carte, Champ, Chargement, Feuille,
  Initiales, Jauge, Message, Vide,
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
  const [feuille, setFeuille] = useState<"paiement" | "statut" | "lien" | null>(null);
  const [lienGenere, setLienGenere] = useState<string | null>(null);

  const { donnees, chargement, erreur, recharger } = useChargement<Dossier>(
    () => api.get<Dossier>(`/api/eleves/${id}`),
    [id],
  );

  return (
    <>
      <header className="entete">
        <button type="button" className="bouton doux petit" onClick={() => navigate(-1)}>
          ← Retour
        </button>
        <h1 style={{ fontSize: 15 }}>Dossier élève</h1>
      </header>

      <main className="contenu">
        {chargement && <Chargement lignes={4} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        {donnees && (
          <>
            <Carte>
              <div className="rangee" style={{ alignItems: "flex-start" }}>
                <Initiales nom={donnees.eleve.nom} prenoms={donnees.eleve.prenoms} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2>{donnees.eleve.prenoms} {donnees.eleve.nom}</h2>
                  <div className="doux">
                    {donnees.eleve.matricule} · Permis {donnees.eleve.categorie}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <BadgeStatutEleve statut={donnees.eleve.statut} />
                  </div>
                </div>
              </div>

              <div className="rangee" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                <a
                  className="bouton doux petit"
                  href={`tel:${donnees.eleve.telephone}`}
                >
                  📞 {donnees.eleve.telephone}
                </a>
                <a
                  className="bouton doux petit"
                  href={lienWhatsApp(donnees.eleve.telephone, `Bonjour ${donnees.eleve.prenoms},`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                {peutGerer && (
                  <button
                    type="button"
                    className="bouton doux petit"
                    onClick={() => setFeuille("lien")}
                  >
                    Lien de suivi
                  </button>
                )}
              </div>
            </Carte>

            <Carte titre="Progression">
              <div className="rangee espace" style={{ marginBottom: 6 }}>
                <span className="doux">
                  {donnees.progression.pourcentage} % du parcours
                </span>
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
                  <div className="faible">Examens</div>
                  <strong style={{ fontSize: 13 }}>
                    {LIBELLE_RESULTAT[donnees.eleve.resultatCode]} ·{" "}
                    {LIBELLE_RESULTAT[donnees.eleve.resultatConduite]}
                  </strong>
                </div>
              </div>
            </Carte>

            <Carte
              titre="Situation financière"
              action={
                peutGerer ? (
                  <button type="button" className="bouton petit" onClick={() => setFeuille("paiement")}>
                    + Encaisser
                  </button>
                ) : undefined
              }
            >
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
              <div className="rangee espace">
                <span className="doux">Reste à payer</span>
                <strong
                  className="nombre"
                  style={{ color: donnees.solde.reste > 0 ? "var(--orange)" : "var(--vert)" }}
                >
                  {fFCFA(donnees.solde.reste)}
                </strong>
              </div>
              {donnees.solde.tropPercu > 0 && (
                <Message ton="alerte">
                  Trop-perçu de {fFCFA(donnees.solde.tropPercu)} — à vérifier en caisse.
                </Message>
              )}
              <div style={{ marginTop: 10 }}>
                <Jauge
                  pourcentage={donnees.solde.tauxRecouvrement}
                  ton={donnees.solde.tauxRecouvrement < 50 ? "orange" : undefined}
                />
              </div>
            </Carte>

            <Carte titre={`Versements (${donnees.paiements.length})`}>
              {donnees.paiements.length === 0 ? (
                <p className="doux">Aucun versement enregistré.</p>
              ) : (
                <div className="liste">
                  {donnees.paiements.map((p) => (
                    <div key={p.id} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">{fFCFA(p.montant)}</div>
                        <div className="secondaire">
                          {fDate(p.date)} · {LIBELLE_MOYEN[p.moyen]} · {p.numeroRecu}
                        </div>
                      </div>
                      {estDirecteur && (
                        <button
                          type="button"
                          className="bouton fantome petit"
                          onClick={async () => {
                            if (!confirm(`Annuler définitivement le reçu ${p.numeroRecu} ?`)) return;
                            await api.delete(`/api/paiements/${p.id}`);
                            recharger();
                          }}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Carte>

            <Carte titre={`Séances (${donnees.seances.length})`}>
              {donnees.seances.length === 0 ? (
                <Vide icone="📅">Aucune séance planifiée.</Vide>
              ) : (
                <div className="liste">
                  {donnees.seances.slice(0, 15).map((s) => (
                    <div key={s.id} className="ligne" style={{ cursor: "default" }}>
                      <div className="corps">
                        <div className="principal">
                          {LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}
                        </div>
                        <div className="secondaire">{fDateHeure(s.debut)}</div>
                        {s.motif && <div className="faible">Motif : {s.motif}</div>}
                      </div>
                      <div className="droite">
                        <BadgeStatutSeance statut={s.statut} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>

            {peutGerer && (
              <Carte titre="Statut du dossier">
                <button
                  type="button"
                  className="bouton doux large"
                  onClick={() => setFeuille("statut")}
                >
                  Changer le statut
                </button>
                {(donnees.eleve.historiqueStatuts ?? []).length > 0 && (
                  <div className="liste" style={{ marginTop: 10 }}>
                    {(donnees.eleve.historiqueStatuts ?? []).slice().reverse().map((h, i) => (
                      <div key={i} className="ligne" style={{ cursor: "default" }}>
                        <div className="corps">
                          <div className="principal">{LIBELLE_STATUT_ELEVE[h.statut]}</div>
                          <div className="secondaire">
                            {fDateHeure(h.horodatage)}
                            {h.motif ? ` — ${h.motif}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Carte>
            )}

            <p className="centre">
              <Link to="/eleves" className="doux">← Tous les élèves</Link>
            </p>
          </>
        )}
      </main>

      {feuille === "paiement" && donnees && (
        <FeuillePaiement
          eleve={donnees.eleve}
          reste={donnees.solde.reste}
          onFermer={() => setFeuille(null)}
          onEnregistre={() => { setFeuille(null); recharger(); }}
        />
      )}

      {feuille === "statut" && donnees && (
        <FeuilleStatut
          statutActuel={donnees.eleve.statut}
          eleveId={donnees.eleve.id}
          onFermer={() => setFeuille(null)}
          onEnregistre={() => { setFeuille(null); recharger(); }}
        />
      )}

      {feuille === "lien" && donnees && (
        <Feuille titre="Lien de suivi de l'élève" onFermer={() => { setFeuille(null); setLienGenere(null); }}>
          <p className="doux">
            Générer un nouveau lien invalide immédiatement le précédent. Utile
            si l'élève a changé de téléphone ou si le lien a été partagé.
          </p>
          {lienGenere ? (
            <>
              <input readOnly value={lienGenere} onFocus={(e) => e.target.select()} />
              <a
                className="bouton large"
                style={{ marginTop: 10 }}
                href={lienWhatsApp(
                  donnees.eleve.telephone,
                  `Bonjour ${donnees.eleve.prenoms}, voici votre espace de suivi : ${lienGenere}`,
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
                  `/api/eleves/${donnees.eleve.id}/lien-portail`,
                );
                setLienGenere(lienPortail(reponse.portailJeton));
              }}
            >
              Générer un nouveau lien
            </button>
          )}
        </Feuille>
      )}
    </>
  );
}

function FeuillePaiement({
  eleve, reste, onFermer, onEnregistre,
}: { eleve: Eleve; reste: number; onFermer: () => void; onEnregistre: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState<MoyenPaiement>("especes");
  const [date, setDate] = useState(aujourdhuiISO());
  const [reference, setReference] = useState("");
  // Généré une seule fois par ouverture de la feuille : c'est ce qui rend
  // l'envoi idempotent si l'utilisateur valide deux fois.
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
    <Feuille titre="Enregistrer un versement" onFermer={onFermer}>
      <p className="doux">
        {eleve.prenoms} {eleve.nom} — reste à payer <strong>{fFCFA(reste)}</strong>
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
          <div className="rangee" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button type="button" className="bouton doux petit" onClick={() => setMontant(String(reste))}>
              Solde entier ({fFCFA(reste)})
            </button>
            <button
              type="button"
              className="bouton doux petit"
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
          <Message ton="alerte">
            Ce montant dépasse le reste dû de {fFCFA(valeur - reste)}.
          </Message>
        )}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || valeur <= 0}>
            {envoi ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}

function FeuilleStatut({
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
    <Feuille titre="Changer le statut" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Nouveau statut">
          <select value={statut} onChange={(e) => setStatut(e.target.value as StatutEleve)}>
            {(Object.keys(LIBELLE_STATUT_ELEVE) as StatutEleve[]).map((s) => (
              <option key={s} value={s} disabled={s === statutActuel}>
                {LIBELLE_STATUT_ELEVE[s]}
                {s === statutActuel ? " (actuel)" : ""}
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

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || statut === statutActuel}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}
