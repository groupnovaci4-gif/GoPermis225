/** Parc automobile : fiches, échéances administratives, entretien. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Badge, Carte, Champ, Chargement, Feuille, Message, Vide } from "../components/ui";
import { aujourdhuiISO, fDate, fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Vehicule } from "../types";

export default function Vehicules() {
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [fiche, setFiche] = useState<Vehicule | null>(null);
  const { donnees, chargement, erreur, recharger } = useChargement<Vehicule[]>(
    () => api.get<Vehicule[]>("/api/vehicules"), [],
  );

  return (
    <>
      <header className="entete">
        <h1>Parc automobile</h1>
        <button type="button" className="bouton petit" onClick={() => setOuvrirCreation(true)}>
          + Véhicule
        </button>
      </header>

      <main className="contenu">
        {chargement && <Chargement lignes={3} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}
        {donnees?.length === 0 && (
          <Vide icone="🚗">
            Aucun véhicule enregistré. Ajoutez-en un pour suivre assurance,
            visite technique et entretien.
          </Vide>
        )}

        {donnees && donnees.length > 0 && (
          <Carte>
            <div className="liste">
              {donnees.map((v) => {
                const expire = (v.alertes ?? []).filter((a) => a.niveau === "expire").length;
                const bientot = (v.alertes ?? []).filter((a) => a.niveau === "bientot").length;
                return (
                  <button key={v.id} type="button" className="ligne" onClick={() => setFiche(v)}>
                    <div className="corps">
                      <div className="principal">{v.immatriculation}</div>
                      <div className="secondaire">
                        {v.modele}{v.annee ? ` · ${v.annee}` : ""} ·{" "}
                        {v.kilometrage.toLocaleString("fr-FR")} km
                      </div>
                    </div>
                    <div className="droite">
                      {!v.actif && <Badge ton="rouge">Hors service</Badge>}
                      {expire > 0 && <Badge ton="rouge">{expire} expiré{expire > 1 ? "s" : ""}</Badge>}
                      {expire === 0 && bientot > 0 && <Badge ton="orange">{bientot} à renouveler</Badge>}
                      {expire === 0 && bientot === 0 && v.actif && <Badge ton="vert">À jour</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Carte>
        )}

        <p className="centre">
          <Link to="/" className="doux">← Tableau de bord</Link>
        </p>
      </main>

      {ouvrirCreation && (
        <FeuilleVehicule
          onFermer={() => setOuvrirCreation(false)}
          onCree={() => { setOuvrirCreation(false); recharger(); }}
        />
      )}

      {fiche && (
        <FeuilleFiche
          vehicule={fiche}
          onFermer={() => setFiche(null)}
          onModifie={() => { setFiche(null); recharger(); }}
        />
      )}
    </>
  );
}

function FeuilleVehicule({ onFermer, onCree }: { onFermer: () => void; onCree: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [immatriculation, setImmatriculation] = useState("");
  const [modele, setModele] = useState("");
  const [annee, setAnnee] = useState("");
  const [kilometrage, setKilometrage] = useState("");
  const [assuranceExpire, setAssuranceExpire] = useState("");
  const [visiteTechniqueExpire, setVisiteTechniqueExpire] = useState("");
  const [vignetteExpire, setVignetteExpire] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.post("/api/vehicules", {
        immatriculation, modele,
        annee: Number(annee) || 0,
        kilometrage: Number(kilometrage) || 0,
        assuranceExpire: assuranceExpire || null,
        visiteTechniqueExpire: visiteTechniqueExpire || null,
        vignetteExpire: vignetteExpire || null,
      });
    });
    if (ok) onCree();
  }

  return (
    <Feuille titre="Ajouter un véhicule" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Immatriculation">
          <input
            value={immatriculation}
            onChange={(e) => setImmatriculation(e.target.value.toUpperCase())}
            required
            maxLength={24}
            placeholder="1234 AB 01"
          />
        </Champ>
        <Champ etiquette="Modèle">
          <input
            value={modele}
            onChange={(e) => setModele(e.target.value)}
            required
            maxLength={120}
            placeholder="Toyota Corolla"
          />
        </Champ>
        <Champ etiquette="Année">
          <input
            value={annee}
            onChange={(e) => setAnnee(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={4}
          />
        </Champ>
        <Champ etiquette="Kilométrage actuel">
          <input
            value={kilometrage}
            onChange={(e) => setKilometrage(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </Champ>
        <Champ etiquette="Assurance — date d'expiration">
          <input type="date" value={assuranceExpire} onChange={(e) => setAssuranceExpire(e.target.value)} />
        </Champ>
        <Champ etiquette="Visite technique — date d'expiration">
          <input
            type="date"
            value={visiteTechniqueExpire}
            onChange={(e) => setVisiteTechniqueExpire(e.target.value)}
          />
        </Champ>
        <Champ etiquette="Vignette — date d'expiration">
          <input type="date" value={vignetteExpire} onChange={(e) => setVignetteExpire(e.target.value)} />
        </Champ>

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}

function FeuilleFiche({
  vehicule, onFermer, onModifie,
}: { vehicule: Vehicule; onFermer: () => void; onModifie: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [nature, setNature] = useState("");
  const [cout, setCout] = useState("");
  const [kilometrage, setKilometrage] = useState(String(vehicule.kilometrage));
  const [date, setDate] = useState(aujourdhuiISO());

  return (
    <Feuille titre={vehicule.immatriculation} onFermer={onFermer}>
      <p className="doux">{vehicule.modele}{vehicule.annee ? ` · ${vehicule.annee}` : ""}</p>

      {(vehicule.alertes ?? []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {(vehicule.alertes ?? []).map((a, i) => (
            <Message key={i} ton={a.niveau === "expire" ? "erreur" : "alerte"}>
              {a.libelle} : {a.niveau === "expire" ? "expirée" : "expire"} le {fDate(a.echeance)}
              {a.niveau === "expire" ? ` (il y a ${Math.abs(a.jours)} jours)` : ` (dans ${a.jours} jours)`}
            </Message>
          ))}
        </div>
      )}

      <Carte titre="Ajouter un entretien">
        <Champ etiquette="Nature">
          <input
            value={nature}
            onChange={(e) => setNature(e.target.value)}
            placeholder="Vidange, pneus, réparation…"
            maxLength={120}
          />
        </Champ>
        <Champ etiquette="Coût (FCFA)">
          <input
            value={cout}
            onChange={(e) => setCout(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </Champ>
        <Champ etiquette="Kilométrage au compteur">
          <input
            value={kilometrage}
            onChange={(e) => setKilometrage(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </Champ>
        <Champ etiquette="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Champ>
        <button
          type="button"
          className="bouton large"
          disabled={envoi || !nature}
          onClick={async () => {
            const ok = await executer(async () => {
              await api.post(`/api/vehicules/${vehicule.id}/entretien`, {
                date, nature, cout: Number(cout) || 0,
                kilometrage: Number(kilometrage) || 0, note: "",
              });
            });
            if (ok) onModifie();
          }}
        >
          Enregistrer l'entretien
        </button>
      </Carte>

      {(vehicule.entretiens ?? []).length > 0 && (
        <Carte titre="Journal d'entretien">
          <div className="liste">
            {(vehicule.entretiens ?? []).slice().reverse().map((e, i) => (
              <div key={i} className="ligne" style={{ cursor: "default" }}>
                <div className="corps">
                  <div className="principal">{e.nature}</div>
                  <div className="secondaire">
                    {fDate(e.date)} · {e.kilometrage.toLocaleString("fr-FR")} km
                  </div>
                </div>
                <div className="droite nombre">{fFCFA(e.cout)}</div>
              </div>
            ))}
          </div>
        </Carte>
      )}

      {erreur && <Message ton="erreur">{erreur}</Message>}

      <button
        type="button"
        className={vehicule.actif ? "bouton danger large" : "bouton doux large"}
        style={{ marginTop: 12 }}
        disabled={envoi}
        onClick={async () => {
          const ok = await executer(async () => {
            await api.patch(`/api/vehicules/${vehicule.id}`, { actif: !vehicule.actif });
          });
          if (ok) onModifie();
        }}
      >
        {vehicule.actif ? "Mettre hors service" : "Remettre en service"}
      </button>
    </Feuille>
  );
}
