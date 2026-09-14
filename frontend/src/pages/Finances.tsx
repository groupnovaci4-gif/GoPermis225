/** Caisse : impayés à relancer, encaissements récents, dépenses. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Carte, Champ, Chargement, Feuille, Message, Tuile, Vide } from "../components/ui";
import { LIBELLE_MOYEN, aujourdhuiISO, fDate, fFCFA, lienWhatsApp } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Impaye, Paiement } from "../types";

interface Depense {
  id: string;
  categorie: string;
  montant: number;
  date: string;
  note?: string;
}

const CATEGORIES_DEPENSE = [
  "Carburant", "Salaire moniteur", "Entretien véhicule", "Assurance",
  "Loyer", "Électricité", "Fournitures", "Autre",
];

export default function Finances() {
  const { estDirecteur } = useSession();
  const [onglet, setOnglet] = useState<"impayes" | "encaissements" | "depenses">("impayes");
  const [ouvrirDepense, setOuvrirDepense] = useState(false);

  const impayes = useChargement<Impaye[]>(() => api.get<Impaye[]>("/api/impayes"), []);
  const paiements = useChargement<Paiement[]>(() => api.get<Paiement[]>("/api/paiements"), []);
  const depenses = useChargement<Depense[]>(() => api.get<Depense[]>("/api/depenses"), []);

  const totalImpaye = (impayes.donnees ?? []).reduce((s, i) => s + i.reste, 0);
  const totalEncaisse = (paiements.donnees ?? []).reduce((s, p) => s + p.montant, 0);

  return (
    <>
      <header className="entete">
        <h1>Caisse</h1>
        <button type="button" className="bouton petit" onClick={() => setOuvrirDepense(true)}>
          + Dépense
        </button>
      </header>

      <main className="contenu">
        <div className="grille-3">
          <Tuile libelle="À recouvrer" valeur={fFCFA(totalImpaye)} ton="orange" />
          <Tuile libelle="Encaissé" valeur={fFCFA(totalEncaisse)} ton="vert" />
          <Tuile libelle="Élèves à relancer" valeur={(impayes.donnees ?? []).length} />
        </div>

        <div className="filtres">
          {([
            ["impayes", "Impayés"],
            ["encaissements", "Encaissements"],
            ["depenses", "Dépenses"],
          ] as const).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              className={`puce${onglet === cle ? " actif" : ""}`}
              onClick={() => setOnglet(cle)}
            >
              {libelle}
            </button>
          ))}
        </div>

        {onglet === "impayes" && (
          <Carte titre="Élèves à relancer">
            {impayes.chargement && <Chargement />}
            {impayes.erreur && <Message ton="erreur">{impayes.erreur}</Message>}
            {impayes.donnees?.length === 0 && (
              <Vide icone="✅">Aucun impayé. Tout est recouvré.</Vide>
            )}
            <div className="liste">
              {(impayes.donnees ?? []).map((i) => (
                <div key={i.eleveId} className="ligne" style={{ cursor: "default" }}>
                  <div className="corps">
                    <Link
                      to={`/eleves/${i.eleveId}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="principal">{i.prenoms} {i.nom}</div>
                    </Link>
                    <div className="secondaire">
                      {i.matricule} · {i.tauxRecouvrement} % réglé
                    </div>
                  </div>
                  <div className="droite">
                    <div><strong style={{ color: "var(--orange)" }}>{fFCFA(i.reste)}</strong></div>
                    <a
                      className="bouton fantome petit"
                      style={{ marginTop: 4 }}
                      href={lienWhatsApp(
                        i.telephone,
                        `Bonjour ${i.prenoms}, il reste ${i.reste} FCFA à régler pour votre formation. Merci de passer à l'auto-école.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Relancer
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Carte>
        )}

        {onglet === "encaissements" && (
          <Carte titre="Derniers encaissements">
            {paiements.chargement && <Chargement />}
            {paiements.donnees?.length === 0 && <Vide icone="💰">Aucun encaissement.</Vide>}
            <div className="liste">
              {(paiements.donnees ?? []).slice(0, 50).map((p) => (
                <div key={p.id} className="ligne" style={{ cursor: "default" }}>
                  <div className="corps">
                    <div className="principal">{fFCFA(p.montant)}</div>
                    <div className="secondaire">
                      {fDate(p.date)} · {LIBELLE_MOYEN[p.moyen]} · {p.numeroRecu}
                    </div>
                  </div>
                  <Link to={`/eleves/${p.eleveId}`} className="bouton fantome petit">
                    Dossier
                  </Link>
                </div>
              ))}
            </div>
          </Carte>
        )}

        {onglet === "depenses" && (
          <Carte titre="Dépenses">
            {depenses.chargement && <Chargement />}
            {depenses.donnees?.length === 0 && <Vide icone="🧾">Aucune dépense saisie.</Vide>}
            <div className="liste">
              {(depenses.donnees ?? []).map((d) => (
                <div key={d.id} className="ligne" style={{ cursor: "default" }}>
                  <div className="corps">
                    <div className="principal">{d.categorie}</div>
                    <div className="secondaire">
                      {fDate(d.date)}{d.note ? ` · ${d.note}` : ""}
                    </div>
                  </div>
                  <div className="droite nombre">− {fFCFA(d.montant)}</div>
                </div>
              ))}
            </div>
          </Carte>
        )}

        {estDirecteur && (
          <p className="centre">
            <Link to="/" className="doux">← Tableau de bord complet</Link>
          </p>
        )}
      </main>

      {ouvrirDepense && (
        <FeuilleDepense
          onFermer={() => setOuvrirDepense(false)}
          onEnregistre={() => { setOuvrirDepense(false); depenses.recharger(); }}
        />
      )}
    </>
  );
}

function FeuilleDepense({
  onFermer, onEnregistre,
}: { onFermer: () => void; onEnregistre: () => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSE[0] ?? "Autre");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState(aujourdhuiISO());
  const [note, setNote] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(async () => {
      await api.post("/api/depenses", {
        categorie, montant: Number(montant) || 0, date, note,
      });
    });
    if (ok) onEnregistre();
  }

  return (
    <Feuille titre="Saisir une dépense" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Catégorie">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {CATEGORIES_DEPENSE.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Champ>
        <Champ etiquette="Montant (FCFA)">
          <input
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            required
            autoFocus
          />
        </Champ>
        <Champ etiquette="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Champ>
        <Champ etiquette="Note (facultatif)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Champ>

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || !montant}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}
