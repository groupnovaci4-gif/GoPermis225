/** Réglages de l'auto-école et journal d'audit. Réservé au directeur. */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Carte, Champ, Chargement, Message } from "../components/ui";
import { LIBELLE_CATEGORIE, fDateHeure, fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Categorie, Ecole, EntreeJournal } from "../types";

export default function Reglages() {
  const { deconnecter } = useSession();
  const { envoi, erreur, executer } = useEnvoi();
  const [succes, setSucces] = useState(false);

  const ecole = useChargement<Ecole>(() => api.get<Ecole>("/api/ecole"), []);
  const journal = useChargement<EntreeJournal[]>(
    () => api.get<EntreeJournal[]>("/api/ecole/journal?limite=50"), [],
  );

  const [nom, setNom] = useState("");
  const [commune, setCommune] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [agrement, setAgrement] = useState("");
  const [tarifs, setTarifs] = useState<Record<string, string>>({});
  const [heuresCode, setHeuresCode] = useState("20");
  const [heuresConduite, setHeuresConduite] = useState("20");

  useEffect(() => {
    const e = ecole.donnees;
    if (!e) return;
    setNom(e.nom ?? "");
    setCommune(e.commune ?? "");
    setAdresse(e.adresse ?? "");
    setTelephone(e.telephone ?? "");
    setAgrement(e.agrement ?? "");
    setHeuresCode(String(e.heuresCodeParDefaut ?? 20));
    setHeuresConduite(String(e.heuresConduiteParDefaut ?? 20));
    const t: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(e.tarifParCategorie ?? {})) {
      t[cle] = String(valeur);
    }
    setTarifs(t);
  }, [ecole.donnees]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setSucces(false);
    const tarifParCategorie: Record<string, number> = {};
    for (const [cle, valeur] of Object.entries(tarifs)) {
      const nombre = Number(valeur);
      if (nombre > 0) tarifParCategorie[cle] = nombre;
    }
    const ok = await executer(async () => {
      await api.patch("/api/ecole", {
        nom, commune, adresse, telephone, agrement, tarifParCategorie,
        heuresCodeParDefaut: Number(heuresCode) || 0,
        heuresConduiteParDefaut: Number(heuresConduite) || 0,
      });
    });
    if (ok) {
      setSucces(true);
      ecole.recharger();
    }
  }

  return (
    <>
      <header className="entete">
        <h1>Réglages</h1>
        <button type="button" className="bouton doux petit" onClick={deconnecter}>Quitter</button>
      </header>

      <main className="contenu">
        {ecole.chargement && <Chargement lignes={4} />}
        {ecole.erreur && <Message ton="erreur">{ecole.erreur}</Message>}

        {ecole.donnees && (
          <form onSubmit={enregistrer}>
            <Carte titre="Identité de l'auto-école">
              <Champ etiquette="Nom">
                <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={120} />
              </Champ>
              <Champ etiquette="Commune">
                <input value={commune} onChange={(e) => setCommune(e.target.value)} maxLength={120} />
              </Champ>
              <Champ etiquette="Adresse">
                <input value={adresse} onChange={(e) => setAdresse(e.target.value)} maxLength={300} />
              </Champ>
              <Champ etiquette="Téléphone">
                <input
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  inputMode="tel"
                  placeholder="07 01 02 03 04"
                />
              </Champ>
              <Champ etiquette="Numéro d'agrément">
                <input value={agrement} onChange={(e) => setAgrement(e.target.value)} maxLength={60} />
              </Champ>
            </Carte>

            <Carte titre="Tarifs par catégorie">
              <p className="faible" style={{ marginBottom: 10 }}>
                Repris automatiquement à l'inscription. Modifier un tarif
                n'affecte pas les élèves déjà inscrits : leur montant est figé
                au jour de leur inscription.
              </p>
              {(Object.keys(LIBELLE_CATEGORIE) as Categorie[]).map((c) => (
                <Champ key={c} etiquette={LIBELLE_CATEGORIE[c]}>
                  <input
                    value={tarifs[c] ?? ""}
                    onChange={(e) =>
                      setTarifs((t) => ({ ...t, [c]: e.target.value.replace(/\D/g, "") }))
                    }
                    inputMode="numeric"
                    placeholder="150000"
                  />
                </Champ>
              ))}
            </Carte>

            <Carte titre="Volumes horaires par défaut">
              <Champ etiquette="Heures de code">
                <input
                  value={heuresCode}
                  onChange={(e) => setHeuresCode(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                />
              </Champ>
              <Champ etiquette="Heures de conduite">
                <input
                  value={heuresConduite}
                  onChange={(e) => setHeuresConduite(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                />
              </Champ>
            </Carte>

            {erreur && <Message ton="erreur">{erreur}</Message>}
            {succes && <Message ton="succes">Réglages enregistrés.</Message>}

            <button type="submit" className="bouton large" disabled={envoi} style={{ marginTop: 12 }}>
              {envoi ? "Enregistrement…" : "Enregistrer les réglages"}
            </button>
          </form>
        )}

        <Carte titre="Raccourcis">
          <div className="actions">
            <Link to="/personnel" className="bouton doux">Personnel</Link>
            <Link to="/vehicules" className="bouton doux">Parc auto</Link>
          </div>
        </Carte>

        <Carte titre="Journal des actions">
          <p className="faible" style={{ marginBottom: 10 }}>
            L'auteur et l'horodatage sont posés par le serveur : ce journal ne
            peut pas être falsifié depuis un téléphone.
          </p>
          {journal.chargement && <Chargement lignes={3} />}
          <div className="liste">
            {(journal.donnees ?? []).map((e) => (
              <div key={e.id} className="ligne" style={{ cursor: "default" }}>
                <div className="corps">
                  <div className="principal">{e.action}</div>
                  <div className="secondaire">
                    {e.acteurNom || "—"} · {fDateHeure(e.creeLe)}
                  </div>
                  {e.details && <div className="faible">{e.details}</div>}
                </div>
              </div>
            ))}
          </div>
        </Carte>

        <p className="centre faible">
          Go Permis 225 — version 1.0 · Montants en {fFCFA(0).replace("0", "").trim()}
        </p>
      </main>
    </>
  );
}
