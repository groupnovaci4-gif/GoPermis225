/** Réglages de l'auto-école et journal d'audit. Réservé au directeur. */

import { useEffect, useState } from "react";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import { Avis, Bloc, Champ, Chargement, Grille } from "../components/ui";
import { LIBELLE_CATEGORIE, fDateHeure } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Categorie, Ecole, EntreeJournal } from "../types";

export default function Reglages() {
  const { envoi, erreur, executer } = useEnvoi();
  const [succes, setSucces] = useState(false);

  const ecole = useChargement<Ecole>(() => api.get<Ecole>("/api/ecole"), []);
  const journal = useChargement<EntreeJournal[]>(
    () => api.get<EntreeJournal[]>("/api/ecole/journal?limite=60"), [],
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
    for (const [cle, valeur] of Object.entries(e.tarifParCategorie ?? {})) t[cle] = String(valeur);
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
    if (ok) { setSucces(true); ecole.recharger(); }
  }

  return (
    <Atelier titre="Réglages" sous="Identité, tarifs et journal des actions">
      {ecole.chargement && <Chargement lignes={5} />}
      {ecole.erreur && <Avis ton="erreur">{ecole.erreur}</Avis>}

      {ecole.donnees && (
        <form onSubmit={enregistrer}>
          <div className="rangs-2">
            <Bloc titre="Identité de l'auto-école">
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
            </Bloc>

            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <Bloc titre="Tarifs par catégorie">
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
              </Bloc>

              <Bloc titre="Volumes horaires par défaut">
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
              </Bloc>
            </div>
          </div>

          {erreur && <Avis ton="erreur">{erreur}</Avis>}
          {succes && <Avis ton="succes">Réglages enregistrés.</Avis>}

          <button type="submit" className="bouton" disabled={envoi} style={{ marginTop: 12 }}>
            {envoi ? "Enregistrement…" : "Enregistrer les réglages"}
          </button>
        </form>
      )}

      <Bloc titre="Journal des actions" sansPadding>
        <p className="faible" style={{ padding: "0 14px 10px" }}>
          L'auteur et l'horodatage sont posés par le serveur : ce journal ne peut
          pas être falsifié depuis un téléphone.
        </p>
        {journal.chargement && <div style={{ padding: 14 }}><Chargement lignes={3} /></div>}
        {!!journal.donnees?.length && (
          <Grille
            colonnes={[
              { cle: "quand", libelle: "Date" },
              { cle: "qui", libelle: "Auteur" },
              { cle: "quoi", libelle: "Action" },
              { cle: "detail", libelle: "Détail" },
            ]}
          >
            {journal.donnees.map((e) => (
              <tr key={e.id}>
                <td className="num">{fDateHeure(e.creeLe)}</td>
                <td>{e.acteurNom || "—"}</td>
                <td className="mono">{e.action}</td>
                <td className="faible">{e.details || "—"}</td>
              </tr>
            ))}
          </Grille>
        )}
      </Bloc>
    </Atelier>
  );
}
