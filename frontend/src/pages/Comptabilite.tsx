/** Comptabilité : créances à recouvrer, encaissements, dépenses. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api, telecharger } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Bloc, Champ, Chargement, Desert, Grille, Indicateur, Volet,
} from "../components/ui";
import { LIBELLE_MOYEN, aujourdhuiISO, fDate, fFCFA, lienWhatsApp } from "../format";
import { useChargement, useEnvoi } from "../hooks";
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

export default function Comptabilite() {
  const [onglet, setOnglet] = useState<"creances" | "encaissements" | "depenses">("encaissements");
  const [saisieDepense, setSaisieDepense] = useState(false);

  const impayes = useChargement<Impaye[]>(() => api.get<Impaye[]>("/api/impayes"), []);
  const paiements = useChargement<Paiement[]>(() => api.get<Paiement[]>("/api/paiements"), []);
  const depenses = useChargement<Depense[]>(() => api.get<Depense[]>("/api/depenses"), []);

  const totalCreances = (impayes.donnees ?? []).reduce((s, i) => s + i.reste, 0);

  // « Du mois » se calcule sur le mois courant, pas sur tout l'historique :
  // c'est l'indicateur que le directeur regarde le matin.
  const moisCourant = new Date().toISOString().slice(0, 7);
  const duMois = (liste: { date: string; montant: number }[]) =>
    liste.filter((x) => String(x.date).slice(0, 7) === moisCourant)
      .reduce((s, x) => s + x.montant, 0);

  const recettesMois = duMois(paiements.donnees ?? []);
  const depensesMois = duMois(depenses.donnees ?? []);

  return (
    <Atelier
      titre="Comptabilité"
      sous="Créances, encaissements et dépenses"
      outils={
        <button type="button" className="bouton" onClick={() => setSaisieDepense(true)}>
          Saisir une dépense
        </button>
      }
    >
      <div className="rangs-3">
        <Indicateur
          glyphe="◳" ton="vert" libelle="Recettes du mois"
          valeur={fFCFA(recettesMois)}
          note={`${fFCFA((paiements.donnees ?? []).reduce((s, p) => s + p.montant, 0))} depuis l'origine`}
        />
        <Indicateur
          glyphe="↘" ton="rouge" libelle="Dépenses du mois"
          valeur={fFCFA(depensesMois)}
          note={`Résultat : ${fFCFA(recettesMois - depensesMois)}`}
        />
        <Indicateur
          glyphe="↗" ton="orange" libelle="Créances ouvertes"
          valeur={fFCFA(totalCreances)}
          note={`${(impayes.donnees ?? []).length} élève(s) débiteur(s)`}
        />
      </div>

      <div className="onglets-texte">
        {([
          ["encaissements", "Encaissements"],
          ["creances", "Créances"],
          ["depenses", "Dépenses"],
        ] as const).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            className={onglet === cle ? "actif" : ""}
            onClick={() => setOnglet(cle)}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "creances" && (
        <Bloc titre="Élèves à relancer" sansPadding>
          {impayes.chargement && <div style={{ padding: 14 }}><Chargement /></div>}
          {impayes.erreur && <div style={{ padding: 14 }}><Avis ton="erreur">{impayes.erreur}</Avis></div>}
          {impayes.donnees?.length === 0 && (
            <Desert glyphe="✓">Aucune créance ouverte. Tout est recouvré.</Desert>
          )}
          {!!impayes.donnees?.length && (
            <Grille
              colonnes={[
                { cle: "eleve", libelle: "Élève" },
                { cle: "frais", libelle: "Frais", droite: true },
                { cle: "regle", libelle: "Réglé", droite: true },
                { cle: "solde", libelle: "Solde dû", droite: true },
                { cle: "act", libelle: "", droite: true },
              ]}
            >
              {impayes.donnees.map((i) => (
                <tr key={i.eleveId}>
                  <td>
                    <Link
                      to={`/eleves/${i.eleveId}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="nom-primaire">{i.prenoms} {i.nom}</div>
                      <div className="nom-secondaire">{i.matricule} · {i.telephone}</div>
                    </Link>
                  </td>
                  <td className="num droite">{fFCFA(i.montantTotal)}</td>
                  <td className="num droite">{fFCFA(i.totalPaye)}</td>
                  <td className="num droite" style={{ color: "var(--orange)", fontWeight: 600 }}>
                    {fFCFA(i.reste)}
                  </td>
                  <td className="droite">
                    <a
                      className="bouton nu"
                      href={lienWhatsApp(
                        i.telephone,
                        `Bonjour ${i.prenoms}, il reste ${i.reste} FCFA à régler pour votre formation. Merci de passer à l'auto-école.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Relancer
                    </a>
                  </td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
      )}

      {onglet === "encaissements" && (
        <Bloc titre="Derniers encaissements" sansPadding>
          {paiements.chargement && <div style={{ padding: 14 }}><Chargement /></div>}
          {paiements.donnees?.length === 0 && <Desert glyphe="◳">Aucun encaissement.</Desert>}
          {!!paiements.donnees?.length && (
            <Grille
              colonnes={[
                { cle: "recu", libelle: "Reçu" },
                { cle: "eleve", libelle: "Élève" },
                { cle: "date", libelle: "Date" },
                { cle: "moyen", libelle: "Moyen" },
                { cle: "montant", libelle: "Montant", droite: true },
                { cle: "doc", libelle: "Document", droite: true },
              ]}
            >
              {paiements.donnees.slice(0, 80).map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.numeroRecu}</td>
                  <td>
                    <Link to={`/eleves/${p.eleveId}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <span className="nom-primaire">{p.eleveNom || "—"}</span>
                    </Link>
                  </td>
                  <td className="num">{fDate(p.date)}</td>
                  <td><span className="jeton orange">{LIBELLE_MOYEN[p.moyen]}</span></td>
                  <td className="num droite" style={{ color: "var(--vert)", fontWeight: 600 }}>
                    {fFCFA(p.montant)}
                  </td>
                  <td className="droite">
                    <button
                      type="button"
                      className="bouton nu"
                      onClick={() =>
                        telecharger(`/api/paiements/${p.id}/recu`, `${p.numeroRecu}.pdf`)
                      }
                    >
                      ⭳ Reçu
                    </button>
                  </td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
      )}

      {onglet === "depenses" && (
        <Bloc titre="Dépenses" sansPadding>
          {depenses.chargement && <div style={{ padding: 14 }}><Chargement /></div>}
          {depenses.donnees?.length === 0 && <Desert glyphe="◱">Aucune dépense saisie.</Desert>}
          {!!depenses.donnees?.length && (
            <Grille
              colonnes={[
                { cle: "cat", libelle: "Catégorie" },
                { cle: "date", libelle: "Date" },
                { cle: "note", libelle: "Note" },
                { cle: "montant", libelle: "Montant", droite: true },
              ]}
            >
              {depenses.donnees.map((d) => (
                <tr key={d.id}>
                  <td className="nom-primaire">{d.categorie}</td>
                  <td className="num">{fDate(d.date)}</td>
                  <td className="faible">{d.note || "—"}</td>
                  <td className="num droite">− {fFCFA(d.montant)}</td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
      )}

      {saisieDepense && (
        <VoletDepense
          onFermer={() => setSaisieDepense(false)}
          onEnregistre={() => { setSaisieDepense(false); depenses.recharger(); }}
        />
      )}
    </Atelier>
  );
}

function VoletDepense({
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
      await api.post("/api/depenses", { categorie, montant: Number(montant) || 0, date, note });
    });
    if (ok) onEnregistre();
  }

  return (
    <Volet titre="Saisir une dépense" onFermer={onFermer}>
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

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi || !montant}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Volet>
  );
}
