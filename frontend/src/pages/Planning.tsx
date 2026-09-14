/** Planning : semaine en cours, conflits, clôture des séances. */

import { useMemo, useState } from "react";

import { api } from "../api";
import {
  BadgeStatutSeance, Carte, Champ, Chargement, Feuille, Message, Vide,
} from "../components/ui";
import {
  LIBELLE_TYPE_SEANCE, fDuree, fHeure,
} from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Eleve, Seance, StatutSeance, TypeSeance, Utilisateur, Vehicule } from "../types";

/** Lundi de la semaine contenant `reference`. */
function lundiDe(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  // getDay() : 0 = dimanche. On ramène au lundi précédent.
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return d;
}

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function Planning() {
  const { peutGerer, estMoniteur, deconnecter, session } = useSession();
  const [decalageSemaine, setDecalageSemaine] = useState(0);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [aCloturer, setACloturer] = useState<Seance | null>(null);

  const debutSemaine = useMemo(() => {
    const d = lundiDe(new Date());
    d.setDate(d.getDate() + decalageSemaine * 7);
    return d;
  }, [decalageSemaine]);

  const finSemaine = useMemo(() => {
    const d = new Date(debutSemaine);
    d.setDate(d.getDate() + 7);
    return d;
  }, [debutSemaine]);

  const { donnees, chargement, erreur, recharger } = useChargement<Seance[]>(
    () =>
      api.get<Seance[]>(
        `/api/seances?du=${debutSemaine.toISOString()}&au=${finSemaine.toISOString()}`,
      ),
    [debutSemaine.getTime()],
  );

  const { donnees: eleves } = useChargement<Eleve[]>(() => api.get<Eleve[]>("/api/eleves"), []);
  const { donnees: personnel } = useChargement<Utilisateur[]>(
    () => api.get<Utilisateur[]>("/api/personnel"), [],
  );

  const nomEleve = (id: string) => {
    const e = eleves?.find((x) => x.id === id);
    return e ? `${e.prenoms} ${e.nom}` : "Élève";
  };
  const nomMoniteur = (id: string) => personnel?.find((x) => x.id === id)?.nom ?? "Moniteur";

  const parJour = useMemo(() => {
    const groupes: Seance[][] = [[], [], [], [], [], [], []];
    for (const s of donnees ?? []) {
      const index = (new Date(s.debut).getDay() + 6) % 7;
      groupes[index]?.push(s);
    }
    for (const g of groupes) {
      g.sort((a, b) => a.debut.localeCompare(b.debut));
    }
    return groupes;
  }, [donnees]);

  return (
    <>
      <header className="entete">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Planning</h1>
          <div className="sous">{estMoniteur ? session?.utilisateur?.nom : "Toute l'école"}</div>
        </div>
        {peutGerer && (
          <button type="button" className="bouton petit" onClick={() => setOuvrirCreation(true)}>
            + Séance
          </button>
        )}
        {estMoniteur && (
          <button type="button" className="bouton doux petit" onClick={deconnecter}>Quitter</button>
        )}
      </header>

      <main className="contenu">
        <div className="rangee espace">
          <button type="button" className="bouton doux petit" onClick={() => setDecalageSemaine((d) => d - 1)}>
            ← Précédente
          </button>
          <strong style={{ fontSize: 13 }}>
            {decalageSemaine === 0
              ? "Cette semaine"
              : debutSemaine.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          </strong>
          <button type="button" className="bouton doux petit" onClick={() => setDecalageSemaine((d) => d + 1)}>
            Suivante →
          </button>
        </div>

        {chargement && <Chargement lignes={4} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        {donnees && donnees.length === 0 && (
          <Vide icone="📅">Aucune séance cette semaine.</Vide>
        )}

        {donnees && donnees.length > 0 &&
          JOURS.map((jour, index) => {
            const seances = parJour[index] ?? [];
            if (seances.length === 0) return null;
            const dateJour = new Date(debutSemaine);
            dateJour.setDate(dateJour.getDate() + index);
            return (
              <Carte
                key={jour}
                titre={`${jour} ${dateJour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`}
              >
                <div className="liste">
                  {seances.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="ligne"
                      onClick={() => setACloturer(s)}
                    >
                      <div className="corps">
                        <div className="principal">
                          {fHeure(s.debut)} — {nomEleve(s.eleveId)}
                        </div>
                        <div className="secondaire">
                          {LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}
                          {!estMoniteur && ` · ${nomMoniteur(s.moniteurId)}`}
                        </div>
                      </div>
                      <div className="droite"><BadgeStatutSeance statut={s.statut} /></div>
                    </button>
                  ))}
                </div>
              </Carte>
            );
          })}
      </main>

      {ouvrirCreation && (
        <FeuilleCreation
          eleves={eleves ?? []}
          moniteurs={(personnel ?? []).filter((p) => p.role === "moniteur" && p.actif)}
          onFermer={() => setOuvrirCreation(false)}
          onCree={() => { setOuvrirCreation(false); recharger(); }}
        />
      )}

      {aCloturer && (
        <FeuilleCloture
          seance={aCloturer}
          nomEleve={nomEleve(aCloturer.eleveId)}
          onFermer={() => setACloturer(null)}
          onEnregistre={() => { setACloturer(null); recharger(); }}
        />
      )}
    </>
  );
}

function FeuilleCreation({
  eleves, moniteurs, onFermer, onCree,
}: {
  eleves: Eleve[]; moniteurs: Utilisateur[];
  onFermer: () => void; onCree: () => void;
}) {
  const { envoi, erreur, setErreur, executer } = useEnvoi();
  const { donnees: vehicules } = useChargement<Vehicule[]>(
    () => api.get<Vehicule[]>("/api/vehicules"), [],
  );

  const [eleveId, setEleveId] = useState("");
  const [moniteurId, setMoniteurId] = useState("");
  const [vehiculeId, setVehiculeId] = useState("");
  const [type, setType] = useState<TypeSeance>("conduite");
  const [jour, setJour] = useState(new Date().toISOString().slice(0, 10));
  const [heure, setHeure] = useState("08:00");
  const [duree, setDuree] = useState("60");
  const [lieu, setLieu] = useState("");
  const [conflitDetecte, setConflitDetecte] = useState(false);

  async function envoyer(forcer: boolean) {
    const debut = new Date(`${jour}T${heure}:00`);
    const fin = new Date(debut.getTime() + Number(duree) * 60000);
    const ok = await executer(async () => {
      await api.post(`/api/seances${forcer ? "?forcer=true" : ""}`, {
        eleveId, moniteurId, vehiculeId, type,
        debut: debut.toISOString(), fin: fin.toISOString(), lieu,
      });
    });
    if (ok) onCree();
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setConflitDetecte(false);
    const debut = new Date(`${jour}T${heure}:00`);
    const fin = new Date(debut.getTime() + Number(duree) * 60000);
    try {
      await api.post("/api/seances", {
        eleveId, moniteurId, vehiculeId, type,
        debut: debut.toISOString(), fin: fin.toISOString(), lieu,
      });
      onCree();
    } catch (e: unknown) {
      const erreurApi = e as { statut?: number; message?: string };
      if (erreurApi.statut === 409) {
        // Conflit : on propose de forcer plutôt que de bloquer sèchement.
        // Le secrétariat connaît parfois des arrangements que l'app ignore.
        setConflitDetecte(true);
        setErreur(erreurApi.message ?? "Ce créneau est déjà occupé.");
      } else {
        setErreur(erreurApi.message ?? "La création a échoué.");
      }
    }
  }

  return (
    <Feuille titre="Nouvelle séance" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Élève">
          <select value={eleveId} onChange={(e) => setEleveId(e.target.value)} required>
            <option value="">Choisir un élève…</option>
            {eleves.map((e) => (
              <option key={e.id} value={e.id}>{e.prenoms} {e.nom} — {e.matricule}</option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Moniteur">
          <select value={moniteurId} onChange={(e) => setMoniteurId(e.target.value)} required>
            <option value="">Choisir un moniteur…</option>
            {moniteurs.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </Champ>
        <Champ etiquette="Type de séance">
          <select value={type} onChange={(e) => setType(e.target.value as TypeSeance)}>
            <option value="conduite">Conduite</option>
            <option value="code">Code</option>
          </select>
        </Champ>
        {type === "conduite" && (
          <Champ etiquette="Véhicule (facultatif)">
            <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)}>
              <option value="">Aucun véhicule affecté</option>
              {(vehicules ?? []).filter((v) => v.actif).map((v) => (
                <option key={v.id} value={v.id}>{v.immatriculation} — {v.modele}</option>
              ))}
            </select>
          </Champ>
        )}
        <Champ etiquette="Jour">
          <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} required />
        </Champ>
        <Champ etiquette="Heure de début">
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required />
        </Champ>
        <Champ etiquette="Durée">
          <select value={duree} onChange={(e) => setDuree(e.target.value)}>
            <option value="30">30 minutes</option>
            <option value="60">1 heure</option>
            <option value="90">1 h 30</option>
            <option value="120">2 heures</option>
          </select>
        </Champ>
        <Champ etiquette="Lieu de rendez-vous (facultatif)">
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={160} />
        </Champ>

        {erreur && <Message ton={conflitDetecte ? "alerte" : "erreur"}>{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          {conflitDetecte ? (
            <button
              type="button"
              className="bouton danger"
              disabled={envoi}
              onClick={() => envoyer(true)}
            >
              Créer quand même
            </button>
          ) : (
            <button type="submit" className="bouton" disabled={envoi}>
              {envoi ? "Création…" : "Créer la séance"}
            </button>
          )}
        </div>
      </form>
    </Feuille>
  );
}

function FeuilleCloture({
  seance, nomEleve, onFermer, onEnregistre,
}: {
  seance: Seance; nomEleve: string;
  onFermer: () => void; onEnregistre: () => void;
}) {
  const { envoi, erreur, executer } = useEnvoi();
  const [statut, setStatut] = useState<StatutSeance>(seance.statut);
  const [motif, setMotif] = useState(seance.motif ?? "");
  const [kilometrage, setKilometrage] = useState(String(seance.kilometrage ?? ""));

  const motifRequis = statut === "annulee" || statut === "absent";

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.patch(`/api/seances/${seance.id}`, {
        statut,
        ...(motif ? { motif } : {}),
        ...(kilometrage ? { kilometrage: Number(kilometrage) } : {}),
      });
    });
    if (ok) onEnregistre();
  }

  return (
    <Feuille titre="Clôturer la séance" onFermer={onFermer}>
      <p className="doux">
        {nomEleve} — {LIBELLE_TYPE_SEANCE[seance.type]}, {fDuree(seance.debut, seance.fin)}
      </p>
      <form onSubmit={soumettre}>
        <Champ etiquette="Résultat de la séance">
          <select value={statut} onChange={(e) => setStatut(e.target.value as StatutSeance)}>
            <option value="planifiee">Planifiée</option>
            <option value="effectuee">Effectuée</option>
            <option value="absent">Élève absent</option>
            <option value="annulee">Annulée</option>
          </select>
        </Champ>
        {motifRequis && (
          <Champ etiquette="Motif" aide="Obligatoire pour une absence ou une annulation.">
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} required />
          </Champ>
        )}
        {statut === "effectuee" && seance.vehiculeId && (
          <Champ etiquette="Kilométrage au compteur (facultatif)">
            <input
              value={kilometrage}
              onChange={(e) => setKilometrage(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </Champ>
        )}

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Fermer</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}
