/** Planning hebdomadaire : conflits détectés, clôture des séances. */

import { useMemo, useState } from "react";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Bloc, Champ, Chargement, Desert, Grille, JetonStatutSeance, Volet,
} from "../components/ui";
import { LIBELLE_TYPE_SEANCE, fDuree, fHeure } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Eleve, Seance, StatutSeance, TypeSeance, Utilisateur, Vehicule } from "../types";

/** Lundi de la semaine contenant `reference`. */
function lundiDe(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay() : 0 = dimanche
  return d;
}

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function Planning() {
  const { peutGerer, estMoniteur } = useSession();
  const [semaine, setSemaine] = useState(0);
  const [creation, setCreation] = useState(false);
  const [aCloturer, setACloturer] = useState<Seance | null>(null);

  const debut = useMemo(() => {
    const d = lundiDe(new Date());
    d.setDate(d.getDate() + semaine * 7);
    return d;
  }, [semaine]);

  const fin = useMemo(() => {
    const d = new Date(debut);
    d.setDate(d.getDate() + 7);
    return d;
  }, [debut]);

  const { donnees, chargement, erreur, recharger } = useChargement<Seance[]>(
    () => api.get<Seance[]>(`/api/seances?du=${debut.toISOString()}&au=${fin.toISOString()}`),
    [debut.getTime()],
  );
  const { donnees: eleves } = useChargement<Eleve[]>(() => api.get<Eleve[]>("/api/eleves"), []);
  const { donnees: personnel } = useChargement<Utilisateur[]>(
    () => api.get<Utilisateur[]>("/api/personnel"), [],
  );

  const nomEleve = (id: string) => {
    const e = eleves?.find((x) => x.id === id);
    return e ? `${e.prenoms} ${e.nom}` : "Élève";
  };
  const nomMoniteur = (id: string) => personnel?.find((x) => x.id === id)?.nom ?? "—";

  const parJour = useMemo(() => {
    const groupes: Seance[][] = [[], [], [], [], [], [], []];
    for (const s of donnees ?? []) {
      groupes[(new Date(s.debut).getDay() + 6) % 7]?.push(s);
    }
    for (const g of groupes) g.sort((a, b) => a.debut.localeCompare(b.debut));
    return groupes;
  }, [donnees]);

  const libelleSemaine =
    semaine === 0
      ? "Cette semaine"
      : `Semaine du ${debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}`;

  return (
    <Atelier
      titre="Planning"
      sous={estMoniteur ? "Vos séances" : "Toutes les séances de l'école"}
      outils={
        <>
          <button type="button" className="bouton doux" onClick={() => setSemaine((s) => s - 1)}>
            ←
          </button>
          <button type="button" className="bouton doux" onClick={() => setSemaine(0)}>
            Aujourd'hui
          </button>
          <button type="button" className="bouton doux" onClick={() => setSemaine((s) => s + 1)}>
            →
          </button>
          {peutGerer && (
            <button type="button" className="bouton" onClick={() => setCreation(true)}>
              Nouvelle séance
            </button>
          )}
        </>
      }
    >
      <div className="sur-titre">{libelleSemaine}</div>

      {chargement && <Chargement lignes={5} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && donnees.length === 0 && (
        <Bloc><Desert glyphe="◰">Aucune séance planifiée cette semaine.</Desert></Bloc>
      )}

      {donnees && donnees.length > 0 &&
        JOURS.map((jour, index) => {
          const seances = parJour[index] ?? [];
          if (seances.length === 0) return null;
          const dateJour = new Date(debut);
          dateJour.setDate(dateJour.getDate() + index);
          return (
            <Bloc
              key={jour}
              titre={`${jour} ${dateJour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`}
              sansPadding
            >
              <Grille
                colonnes={[
                  { cle: "h", libelle: "Heure" },
                  { cle: "eleve", libelle: "Élève" },
                  { cle: "type", libelle: "Type" },
                  ...(estMoniteur ? [] : [{ cle: "mon", libelle: "Moniteur" }]),
                  { cle: "lieu", libelle: "Lieu" },
                  { cle: "statut", libelle: "Statut", droite: true },
                  { cle: "act", libelle: "", droite: true },
                ]}
              >
                {seances.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{fHeure(s.debut)}</td>
                    <td className="nom-primaire">{nomEleve(s.eleveId)}</td>
                    <td>{LIBELLE_TYPE_SEANCE[s.type]} · {fDuree(s.debut, s.fin)}</td>
                    {!estMoniteur && <td>{nomMoniteur(s.moniteurId)}</td>}
                    <td className="faible">{s.lieu || "—"}</td>
                    <td className="droite"><JetonStatutSeance statut={s.statut} /></td>
                    <td className="droite">
                      <button type="button" className="bouton nu" onClick={() => setACloturer(s)}>
                        Clôturer
                      </button>
                    </td>
                  </tr>
                ))}
              </Grille>
            </Bloc>
          );
        })}

      {creation && (
        <VoletCreation
          eleves={eleves ?? []}
          moniteurs={(personnel ?? []).filter((p) => p.role === "moniteur" && p.actif)}
          onFermer={() => setCreation(false)}
          onCree={() => { setCreation(false); recharger(); }}
        />
      )}

      {aCloturer && (
        <VoletCloture
          seance={aCloturer}
          nomEleve={nomEleve(aCloturer.eleveId)}
          onFermer={() => setACloturer(null)}
          onEnregistre={() => { setACloturer(null); recharger(); }}
        />
      )}
    </Atelier>
  );
}

function VoletCreation({
  eleves, moniteurs, onFermer, onCree,
}: { eleves: Eleve[]; moniteurs: Utilisateur[]; onFermer: () => void; onCree: () => void }) {
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
  const [conflit, setConflit] = useState(false);

  function creneau() {
    const d = new Date(`${jour}T${heure}:00`);
    return { debut: d.toISOString(), fin: new Date(d.getTime() + Number(duree) * 60000).toISOString() };
  }

  async function envoyerForce() {
    const ok = await executer(async () => {
      await api.post("/api/seances?forcer=true", {
        eleveId, moniteurId, vehiculeId, type, lieu, ...creneau(),
      });
    });
    if (ok) onCree();
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setConflit(false);
    try {
      await api.post("/api/seances", { eleveId, moniteurId, vehiculeId, type, lieu, ...creneau() });
      onCree();
    } catch (err: unknown) {
      const erreurApi = err as { statut?: number; message?: string };
      // Un conflit est un avertissement, pas un mur : le secrétariat connaît
      // parfois des arrangements que l'application ignore.
      if (erreurApi.statut === 409) setConflit(true);
      setErreur(erreurApi.message ?? "La création a échoué.");
    }
  }

  return (
    <Volet titre="Nouvelle séance" onFermer={onFermer}>
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

        {erreur && <Avis ton={conflit ? "alerte" : "erreur"}>{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          {conflit ? (
            <button type="button" className="bouton danger" disabled={envoi} onClick={envoyerForce}>
              Créer quand même
            </button>
          ) : (
            <button type="submit" className="bouton" disabled={envoi}>
              {envoi ? "Création…" : "Créer la séance"}
            </button>
          )}
        </div>
      </form>
    </Volet>
  );
}

function VoletCloture({
  seance, nomEleve, onFermer, onEnregistre,
}: { seance: Seance; nomEleve: string; onFermer: () => void; onEnregistre: () => void }) {
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
    <Volet titre="Clôturer la séance" onFermer={onFermer}>
      <p className="faible">
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

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Fermer</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Volet>
  );
}
