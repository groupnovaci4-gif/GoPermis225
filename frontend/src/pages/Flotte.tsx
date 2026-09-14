/** Flotte automobile : fiches, échéances administratives, entretien. */

import { useState } from "react";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Bloc, Champ, Chargement, Desert, Grille, Jeton, Volet,
} from "../components/ui";
import { aujourdhuiISO, fDate, fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Vehicule } from "../types";

export default function Flotte() {
  const [creation, setCreation] = useState(false);
  const [fiche, setFiche] = useState<Vehicule | null>(null);
  const { donnees, chargement, erreur, recharger } = useChargement<Vehicule[]>(
    () => api.get<Vehicule[]>("/api/vehicules"), [],
  );

  return (
    <Atelier
      titre="Flotte automobile"
      sous={donnees ? `${donnees.length} véhicule(s)` : undefined}
      outils={
        <button type="button" className="bouton" onClick={() => setCreation(true)}>
          Ajouter un véhicule
        </button>
      }
    >
      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && (
        <Bloc sansPadding>
          {donnees.length === 0 ? (
            <Desert glyphe="◴">
              Aucun véhicule enregistré. Ajoutez-en un pour suivre assurance,
              visite technique et entretien.
            </Desert>
          ) : (
            <Grille
              colonnes={[
                { cle: "immat", libelle: "Véhicule" },
                { cle: "km", libelle: "Kilométrage", droite: true },
                { cle: "assur", libelle: "Assurance" },
                { cle: "visite", libelle: "Visite technique" },
                { cle: "etat", libelle: "État", droite: true },
                { cle: "act", libelle: "Fiche", droite: true },
              ]}
            >
              {donnees.map((v) => {
                const expire = (v.alertes ?? []).filter((a) => a.niveau === "expire").length;
                const bientot = (v.alertes ?? []).filter((a) => a.niveau === "bientot").length;
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="nom-primaire mono">{v.immatriculation}</div>
                      <div className="nom-secondaire">
                        {v.modele}{v.annee ? ` · ${v.annee}` : ""}
                      </div>
                    </td>
                    <td className="num droite">{v.kilometrage.toLocaleString("fr-FR")} km</td>
                    <td className="num">{fDate(v.assuranceExpire)}</td>
                    <td className="num">{fDate(v.visiteTechniqueExpire)}</td>
                    <td className="droite">
                      {!v.actif && <Jeton ton="rouge">Hors service</Jeton>}
                      {v.actif && expire > 0 && <Jeton ton="rouge">{expire} expiré(s)</Jeton>}
                      {v.actif && expire === 0 && bientot > 0 && (
                        <Jeton ton="orange">{bientot} à renouveler</Jeton>
                      )}
                      {v.actif && expire === 0 && bientot === 0 && <Jeton ton="vert">À jour</Jeton>}
                    </td>
                    <td className="droite">
                      <button type="button" className="bouton nu" onClick={() => setFiche(v)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Grille>
          )}
        </Bloc>
      )}

      {creation && (
        <VoletVehicule
          onFermer={() => setCreation(false)}
          onCree={() => { setCreation(false); recharger(); }}
        />
      )}

      {fiche && (
        <VoletFiche
          vehicule={fiche}
          onFermer={() => setFiche(null)}
          onModifie={() => { setFiche(null); recharger(); }}
        />
      )}
    </Atelier>
  );
}

function VoletVehicule({ onFermer, onCree }: { onFermer: () => void; onCree: () => void }) {
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
    <Volet titre="Ajouter un véhicule" onFermer={onFermer}>
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
        <Champ etiquette="Assurance — expire le">
          <input type="date" value={assuranceExpire} onChange={(e) => setAssuranceExpire(e.target.value)} />
        </Champ>
        <Champ etiquette="Visite technique — expire le">
          <input
            type="date"
            value={visiteTechniqueExpire}
            onChange={(e) => setVisiteTechniqueExpire(e.target.value)}
          />
        </Champ>
        <Champ etiquette="Vignette — expire le">
          <input type="date" value={vignetteExpire} onChange={(e) => setVignetteExpire(e.target.value)} />
        </Champ>

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Volet>
  );
}

function VoletFiche({
  vehicule, onFermer, onModifie,
}: { vehicule: Vehicule; onFermer: () => void; onModifie: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [nature, setNature] = useState("");
  const [cout, setCout] = useState("");
  const [kilometrage, setKilometrage] = useState(String(vehicule.kilometrage));
  const [date, setDate] = useState(aujourdhuiISO());

  return (
    <Volet titre={vehicule.immatriculation} onFermer={onFermer}>
      <p className="faible">{vehicule.modele}{vehicule.annee ? ` · ${vehicule.annee}` : ""}</p>

      {(vehicule.alertes ?? []).map((a, i) => (
        <Avis key={i} ton={a.niveau === "expire" ? "erreur" : "alerte"}>
          {a.libelle} : {a.niveau === "expire" ? "expirée" : "expire"} le {fDate(a.echeance)}
          {a.niveau === "expire" ? ` (il y a ${Math.abs(a.jours)} jours)` : ` (dans ${a.jours} jours)`}
        </Avis>
      ))}

      <Bloc titre="Ajouter un entretien">
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
      </Bloc>

      {(vehicule.entretiens ?? []).length > 0 && (
        <Bloc titre="Journal d'entretien" sansPadding>
          <Grille
            colonnes={[
              { cle: "date", libelle: "Date" },
              { cle: "nature", libelle: "Nature" },
              { cle: "cout", libelle: "Coût", droite: true },
            ]}
          >
            {(vehicule.entretiens ?? []).slice().reverse().map((e, i) => (
              <tr key={i}>
                <td className="num">{fDate(e.date)}</td>
                <td>{e.nature}</td>
                <td className="num droite">{fFCFA(e.cout)}</td>
              </tr>
            ))}
          </Grille>
        </Bloc>
      )}

      {erreur && <Avis ton="erreur">{erreur}</Avis>}

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
    </Volet>
  );
}
