/** Personnel : moniteurs et secrétariat. Réservé au directeur. */

import { useState } from "react";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import { Avis, Bloc, Champ, Chargement, Desert, Jeton, Volet } from "../components/ui";
import { fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Role, Utilisateur } from "../types";

interface LignePaie {
  moniteurId: string;
  heuresSemaine: number;
  heuresMois: number;
  paieMois: number;
  elevesSuivis: number;
  tauxReussite: number;
}

const LIBELLE_ROLE: Record<Role, string> = {
  directeur: "Directeur",
  secretaire: "Secrétariat",
  moniteur: "Moniteur",
};

export default function Moniteurs() {
  const [creation, setCreation] = useState(false);
  const [fiche, setFiche] = useState<Utilisateur | null>(null);
  const { donnees, chargement, erreur, recharger } = useChargement<Utilisateur[]>(
    () => api.get<Utilisateur[]>("/api/personnel"), [],
  );
  // Heures et paie du mois, calculées par le serveur : la page ne doit pas
  // recharger tout le tableau de bord pour afficher une carte.
  const paie = useChargement<LignePaie[]>(() => api.get<LignePaie[]>("/api/personnel/paie"), []);

  return (
    <Atelier
      titre="Moniteurs et personnel"
      sous={donnees ? `${donnees.length} collaborateur(s) · heures validées et paie du mois` : undefined}
      outils={
        <button type="button" className="bouton" onClick={() => setCreation(true)}>
          Ajouter un collaborateur
        </button>
      }
    >
      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && donnees.length === 0 && (
        <Desert glyphe="◵">Aucun collaborateur enregistré.</Desert>
      )}

      {donnees && donnees.length > 0 && (
        <div className="fiches">
          {donnees.map((u) => {
            const p = (paie.donnees ?? []).find((x) => x.moniteurId === u.id);
            const moniteur = u.role === "moniteur";
            return (
              <article key={u.id} className="fiche">
                <div className="fiche-tete">
                  <div className="identite">
                    <div className="principal texte">{u.nom}</div>
                    <div className="secondaire mono">{u.telephone}</div>
                  </div>
                  {u.actif ? (
                    <Jeton ton={moniteur ? "vert" : "bleu"}>{LIBELLE_ROLE[u.role]}</Jeton>
                  ) : (
                    <Jeton ton="rouge">Désactivé</Jeton>
                  )}
                </div>

                {moniteur ? (
                  <div className="paires">
                    <div>
                      <div className="cle">Heures (semaine)</div>
                      <div className="val">{p ? `${p.heuresSemaine} h` : "—"}</div>
                    </div>
                    <div>
                      <div className="cle">Heures (mois)</div>
                      <div className="val">{p ? `${p.heuresMois} h` : "—"}</div>
                    </div>
                    <div>
                      <div className="cle">Taux horaire</div>
                      <div className="val">{fFCFA(u.tarifHoraire ?? 0)}</div>
                    </div>
                    <div>
                      <div className="cle">Élèves suivis</div>
                      <div className="val">{p?.elevesSuivis ?? 0}</div>
                    </div>
                    <div>
                      <div className="cle">Agrément</div>
                      <div className="val">{u.permisEnseigner || "—"}</div>
                    </div>
                    <div>
                      <div className="cle">Réussite</div>
                      <div className="val">{p ? `${p.tauxReussite} %` : "—"}</div>
                    </div>
                  </div>
                ) : (
                  <p className="faible" style={{ margin: 0 }}>
                    {u.role === "directeur"
                      ? "Accès complet à l'école : réglages, comptabilité et personnel."
                      : "Gestion courante : inscriptions, encaissements et planning."}
                  </p>
                )}

                {moniteur && (
                  <div className="encart">
                    <span className="cle">Paie du mois</span>
                    <span className="val">{fFCFA(p?.paieMois ?? 0)}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="bouton doux large"
                  style={{ marginTop: "auto", marginBlockStart: 12 }}
                  onClick={() => setFiche(u)}
                >
                  Ouvrir la fiche
                </button>
              </article>
            );
          })}
        </div>
      )}

      {creation && (
        <VoletCreation
          onFermer={() => setCreation(false)}
          onCree={() => { setCreation(false); recharger(); }}
        />
      )}

      {fiche && (
        <VoletFiche
          agent={fiche}
          onFermer={() => setFiche(null)}
          onModifie={() => { setFiche(null); recharger(); }}
        />
      )}
    </Atelier>
  );
}

function VoletCreation({ onFermer, onCree }: { onFermer: () => void; onCree: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [role, setRole] = useState<Role>("moniteur");
  const [motDePasse, setMotDePasse] = useState("");
  const [tarifHoraire, setTarifHoraire] = useState("");
  const [permisEnseigner, setPermisEnseigner] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.post("/api/personnel", {
        nom, telephone, role, motDePasse,
        tarifHoraire: Number(tarifHoraire) || 0, permisEnseigner,
      });
    });
    if (ok) onCree();
  }

  return (
    <Volet titre="Ajouter un collaborateur" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Nom complet">
          <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={120} />
        </Champ>
        <Champ etiquette="Téléphone" aide="Servira d'identifiant de connexion.">
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
            inputMode="tel"
            placeholder="07 01 02 03 04"
          />
        </Champ>
        <Champ etiquette="Rôle">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="moniteur">Moniteur</option>
            <option value="secretaire">Secrétariat</option>
            <option value="directeur">Directeur</option>
          </select>
        </Champ>
        <Champ etiquette="Mot de passe provisoire" aide="8 caractères minimum.">
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Champ>
        {role === "moniteur" && (
          <>
            <Champ etiquette="Tarif horaire (FCFA)" aide="Sert au calcul automatique de la paie.">
              <input
                value={tarifHoraire}
                onChange={(e) => setTarifHoraire(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="2500"
              />
            </Champ>
            <Champ etiquette="N° permis d'enseigner (facultatif)">
              <input
                value={permisEnseigner}
                onChange={(e) => setPermisEnseigner(e.target.value)}
                maxLength={60}
              />
            </Champ>
          </>
        )}

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Création…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Volet>
  );
}

function VoletFiche({
  agent, onFermer, onModifie,
}: { agent: Utilisateur; onFermer: () => void; onModifie: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [tarifHoraire, setTarifHoraire] = useState(String(agent.tarifHoraire ?? ""));
  const [nouveauMdp, setNouveauMdp] = useState("");

  const salaire = useChargement<{ heures: number; montant: number; tarifHoraire: number }>(
    () => api.get(`/api/personnel/${agent.id}/salaire`),
    [agent.id],
  );

  return (
    <Volet titre={agent.nom} onFermer={onFermer}>
      <p className="faible">{LIBELLE_ROLE[agent.role]} · {agent.telephone}</p>

      {agent.role === "moniteur" && salaire.donnees && (
        <Bloc titre="Heures et rémunération">
          <div className="ligne-flex espace">
            <span className="faible">Heures effectuées</span>
            <strong className="mono">{salaire.donnees.heures} h</strong>
          </div>
          <div className="ligne-flex espace">
            <span className="faible">Rémunération due</span>
            <strong className="mono">{fFCFA(salaire.donnees.montant)}</strong>
          </div>
          <p className="faible" style={{ marginTop: 8 }}>
            Calcul : heures des séances marquées « effectuée » × tarif horaire.
            Une séance planifiée ou annulée n'est jamais comptée.
          </p>
        </Bloc>
      )}

      {agent.role === "moniteur" && (
        <Champ etiquette="Tarif horaire (FCFA)">
          <input
            value={tarifHoraire}
            onChange={(e) => setTarifHoraire(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </Champ>
      )}

      <Champ etiquette="Réinitialiser le mot de passe" aide="Laisser vide pour ne pas y toucher.">
        <input
          type="password"
          value={nouveauMdp}
          onChange={(e) => setNouveauMdp(e.target.value)}
          minLength={8}
          autoComplete="new-password"
        />
      </Champ>

      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      <div className="actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className={agent.actif ? "bouton danger" : "bouton doux"}
          disabled={envoi}
          onClick={async () => {
            const ok = await executer(async () => {
              await api.patch(`/api/personnel/${agent.id}`, { actif: !agent.actif });
            });
            if (ok) onModifie();
          }}
        >
          {agent.actif ? "Désactiver" : "Réactiver"}
        </button>
        <button
          type="button"
          className="bouton"
          disabled={envoi}
          onClick={async () => {
            const ok = await executer(async () => {
              if (agent.role === "moniteur") {
                await api.patch(`/api/personnel/${agent.id}`, {
                  tarifHoraire: Number(tarifHoraire) || 0,
                });
              }
              if (nouveauMdp) {
                await api.post(`/api/personnel/${agent.id}/mot-de-passe`, { motDePasse: nouveauMdp });
              }
            });
            if (ok) onModifie();
          }}
        >
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Volet>
  );
}
