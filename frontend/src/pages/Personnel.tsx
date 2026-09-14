/** Personnel : moniteurs et secrétaires. Réservé au directeur. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Badge, Carte, Champ, Chargement, Feuille, Message, Vide } from "../components/ui";
import { fFCFA } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { Role, Utilisateur } from "../types";

const LIBELLE_ROLE: Record<Role, string> = {
  directeur: "Directeur",
  secretaire: "Secrétaire",
  moniteur: "Moniteur",
};

export default function Personnel() {
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [fiche, setFiche] = useState<Utilisateur | null>(null);
  const { donnees, chargement, erreur, recharger } = useChargement<Utilisateur[]>(
    () => api.get<Utilisateur[]>("/api/personnel"), [],
  );

  return (
    <>
      <header className="entete">
        <h1>Personnel</h1>
        <button type="button" className="bouton petit" onClick={() => setOuvrirCreation(true)}>
          + Ajouter
        </button>
      </header>

      <main className="contenu">
        {chargement && <Chargement lignes={3} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}
        {donnees?.length === 0 && <Vide icone="👨‍🏫">Aucun collaborateur.</Vide>}

        {donnees && donnees.length > 0 && (
          <Carte>
            <div className="liste">
              {donnees.map((u) => (
                <button key={u.id} type="button" className="ligne" onClick={() => setFiche(u)}>
                  <div className="corps">
                    <div className="principal">{u.nom}</div>
                    <div className="secondaire">
                      {LIBELLE_ROLE[u.role]} · {u.telephone}
                    </div>
                  </div>
                  <div className="droite">
                    {u.actif ? <Badge ton="vert">Actif</Badge> : <Badge ton="rouge">Désactivé</Badge>}
                    {u.role === "moniteur" && (u.tarifHoraire ?? 0) > 0 && (
                      <div className="faible">{fFCFA(u.tarifHoraire ?? 0)}/h</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Carte>
        )}

        <p className="centre">
          <Link to="/vehicules" className="doux">Gérer le parc automobile →</Link>
        </p>
        <p className="centre">
          <Link to="/" className="doux">← Tableau de bord</Link>
        </p>
      </main>

      {ouvrirCreation && (
        <FeuilleCreation
          onFermer={() => setOuvrirCreation(false)}
          onCree={() => { setOuvrirCreation(false); recharger(); }}
        />
      )}

      {fiche && (
        <FeuilleFiche
          agent={fiche}
          onFermer={() => setFiche(null)}
          onModifie={() => { setFiche(null); recharger(); }}
        />
      )}
    </>
  );
}

function FeuilleCreation({ onFermer, onCree }: { onFermer: () => void; onCree: () => void }) {
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
        tarifHoraire: Number(tarifHoraire) || 0,
        permisEnseigner,
      });
    });
    if (ok) onCree();
  }

  return (
    <Feuille titre="Ajouter un collaborateur" onFermer={onFermer}>
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
            <option value="secretaire">Secrétaire</option>
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
            <Champ etiquette="Tarif horaire (FCFA)" aide="Sert au calcul automatique du salaire.">
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

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Création…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}

function FeuilleFiche({
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
    <Feuille titre={agent.nom} onFermer={onFermer}>
      <p className="doux">
        {LIBELLE_ROLE[agent.role]} · {agent.telephone}
      </p>

      {agent.role === "moniteur" && salaire.donnees && (
        <Carte titre="Ce mois">
          <div className="rangee espace">
            <span className="doux">Heures effectuées</span>
            <strong className="nombre">{salaire.donnees.heures} h</strong>
          </div>
          <div className="rangee espace">
            <span className="doux">Rémunération</span>
            <strong className="nombre">{fFCFA(salaire.donnees.montant)}</strong>
          </div>
          <p className="faible" style={{ marginTop: 6 }}>
            Calcul : heures des séances marquées « effectuée » × tarif horaire.
          </p>
        </Carte>
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

      {erreur && <Message ton="erreur">{erreur}</Message>}

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
                await api.post(`/api/personnel/${agent.id}/mot-de-passe`, {
                  motDePasse: nouveauMdp,
                });
              }
            });
            if (ok) onModifie();
          }}
        >
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Feuille>
  );
}
