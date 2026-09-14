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
      sous={
        donnees
          ? `${donnees.length} véhicule(s) · ${donnees.reduce((n, v) => n + (v.alertes?.length ?? 0), 0)} alerte(s)`
          : undefined
      }
      outils={
        <button type="button" className="bouton" onClick={() => setCreation(true)}>
          Ajouter un véhicule
        </button>
      }
    >
      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && donnees.length === 0 && (
        <Desert glyphe="◴">
          Aucun véhicule enregistré. Ajoutez-en un pour suivre assurance,
          visite technique et entretien.
        </Desert>
      )}

      {donnees && donnees.length > 0 && (
        <div className="fiches">
          {donnees.map((v) => {
            const cout = (v.entretiens ?? []).reduce((s, e) => s + (e.cout || 0), 0);
            const expire = (v.alertes ?? []).filter((a) => a.niveau === "expire");
            const bientot = (v.alertes ?? []).filter((a) => a.niveau === "bientot");
            return (
              <article key={v.id} className="fiche">
                <div className="fiche-tete">
                  <div className="identite">
                    <div className="principal">{v.immatriculation}</div>
                    <div className="secondaire">
                      {v.modele}{v.annee ? ` · ${v.annee}` : ""}
                    </div>
                  </div>
                  {v.actif ? <Jeton ton="vert">Disponible</Jeton> : <Jeton ton="orange">En maintenance</Jeton>}
                </div>

                <div className="paires">
                  <div>
                    <div className="cle">Kilométrage</div>
                    <div className="val">{v.kilometrage.toLocaleString("fr-FR")} km</div>
                  </div>
                  <div>
                    <div className="cle">Coût entretien</div>
                    <div className="val">{fFCFA(cout)}</div>
                  </div>
                  <div>
                    <div className="cle">Assurance</div>
                    <div className="val">{fDate(v.assuranceExpire)}</div>
                  </div>
                  <div>
                    <div className="cle">Visite technique</div>
                    <div className="val">{fDate(v.visiteTechniqueExpire)}</div>
                  </div>
                </div>

                {expire.map((a, i) => (
                  <Avis key={`x${i}`} ton="erreur">
                    ⚠ {a.libelle} expirée le {fDate(a.echeance)}
                  </Avis>
                ))}
                {bientot.map((a, i) => (
                  <Avis key={`b${i}`} ton="alerte">
                    ⚠ {a.libelle} expire le {fDate(a.echeance)} — dans {a.jours} jours
                  </Avis>
                ))}

                {(v.entretiens ?? []).length > 0 && (
                  <div className="journal-mini">
                    <div className="sur-titre" style={{ marginBottom: 5 }}>Journal d'entretien</div>
                    {(v.entretiens ?? []).slice().reverse().slice(0, 4).map((e, i) => (
                      <div key={i} className="entree">
                        <span>{e.nature}</span>
                        <span className="montant">{fFCFA(e.cout)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="bouton doux large"
                  style={{ marginTop: "auto", marginBlockStart: 12 }}
                  onClick={() => setFiche(v)}
                >
                  Enregistrer un entretien
                </button>
              </article>
            );
          })}
        </div>
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
