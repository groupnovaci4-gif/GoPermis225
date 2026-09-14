/** Personnel : moniteurs et secrétariat. Réservé au directeur. */

import { useState } from "react";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Bloc, Champ, Chargement, Desert, Grille, Jeton, Volet,
} from "../components/ui";
import { fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Role, Utilisateur } from "../types";

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

  return (
    <Atelier
      titre="Moniteurs et personnel"
      sous={donnees ? `${donnees.length} collaborateur(s)` : undefined}
      outils={
        <button type="button" className="bouton" onClick={() => setCreation(true)}>
          Ajouter un collaborateur
        </button>
      }
    >
      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && (
        <Bloc sansPadding>
          {donnees.length === 0 ? (
            <Desert glyphe="◵">Aucun collaborateur enregistré.</Desert>
          ) : (
            <Grille
              colonnes={[
                { cle: "nom", libelle: "Collaborateur" },
                { cle: "role", libelle: "Rôle" },
                { cle: "tarif", libelle: "Tarif horaire", droite: true },
                { cle: "etat", libelle: "État", droite: true },
                { cle: "act", libelle: "Fiche", droite: true },
              ]}
            >
              {donnees.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="nom-primaire">{u.nom}</div>
                    <div className="nom-secondaire">{u.telephone}</div>
                  </td>
                  <td>{LIBELLE_ROLE[u.role]}</td>
                  <td className="num droite">
                    {u.role === "moniteur" ? fFCFA(u.tarifHoraire ?? 0) : "—"}
                  </td>
                  <td className="droite">
                    {u.actif ? <Jeton ton="vert">Actif</Jeton> : <Jeton ton="rouge">Désactivé</Jeton>}
                  </td>
                  <td className="droite">
                    <button type="button" className="bouton nu" onClick={() => setFiche(u)}>
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
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
