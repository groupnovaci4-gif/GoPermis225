/** Liste des élèves, recherche, filtres et inscription. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import {
  BadgeStatutEleve, Carte, Champ, Chargement, Feuille, Initiales, Message, Vide,
} from "../components/ui";
import { LIBELLE_CATEGORIE, fFCFA, lienPortail, lienWhatsApp } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Categorie, Eleve, StatutEleve } from "../types";

const FILTRES: { valeur: StatutEleve | "tous"; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "actif", libelle: "Actifs" },
  { valeur: "suspendu", libelle: "Suspendus" },
  { valeur: "diplome", libelle: "Diplômés" },
  { valeur: "abandon", libelle: "Abandons" },
];

export default function Eleves() {
  const { peutGerer } = useSession();
  const [filtre, setFiltre] = useState<StatutEleve | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [ouvrirFormulaire, setOuvrirFormulaire] = useState(false);
  const [nouveauLien, setNouveauLien] = useState<{ eleve: Eleve; lien: string } | null>(null);

  const requete = new URLSearchParams();
  if (filtre !== "tous") requete.set("statut", filtre);
  if (recherche.trim()) requete.set("recherche", recherche.trim());

  const { donnees, chargement, erreur, recharger } = useChargement<Eleve[]>(
    () => api.get<Eleve[]>(`/api/eleves?${requete.toString()}`),
    [filtre, recherche],
  );

  return (
    <>
      <header className="entete">
        <h1>Élèves</h1>
        {peutGerer && (
          <button type="button" className="bouton petit" onClick={() => setOuvrirFormulaire(true)}>
            + Inscrire
          </button>
        )}
      </header>

      <main className="contenu">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom, un matricule, un numéro…"
          aria-label="Rechercher un élève"
        />

        <div className="filtres">
          {FILTRES.map((f) => (
            <button
              key={f.valeur}
              type="button"
              className={`puce${filtre === f.valeur ? " actif" : ""}`}
              onClick={() => setFiltre(f.valeur)}
            >
              {f.libelle}
            </button>
          ))}
        </div>

        {chargement && <Chargement lignes={5} />}
        {erreur && <Message ton="erreur">{erreur}</Message>}

        {donnees && donnees.length === 0 && (
          <Vide icone="👥">
            {recherche
              ? "Aucun élève ne correspond à cette recherche."
              : "Aucun élève pour l'instant."}
          </Vide>
        )}

        {donnees && donnees.length > 0 && (
          <Carte>
            <div className="liste">
              {donnees.map((e) => (
                <Link
                  key={e.id}
                  to={`/eleves/${e.id}`}
                  className="ligne"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Initiales nom={e.nom} prenoms={e.prenoms} />
                  <div className="corps">
                    <div className="principal">{e.prenoms} {e.nom}</div>
                    <div className="secondaire">
                      {e.matricule} · Permis {e.categorie}
                    </div>
                  </div>
                  <div className="droite">
                    <BadgeStatutEleve statut={e.statut} />
                    <div className="faible">{fFCFA(e.montantTotal)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Carte>
        )}
      </main>

      {ouvrirFormulaire && (
        <FormulaireInscription
          onFermer={() => setOuvrirFormulaire(false)}
          onCree={(eleve, lien) => {
            setOuvrirFormulaire(false);
            setNouveauLien({ eleve, lien });
            recharger();
          }}
        />
      )}

      {nouveauLien && (
        <Feuille titre="Élève inscrit" onFermer={() => setNouveauLien(null)}>
          <Message ton="succes">
            {nouveauLien.eleve.prenoms} {nouveauLien.eleve.nom} — matricule{" "}
            <strong>{nouveauLien.eleve.matricule}</strong>
          </Message>
          <p className="doux" style={{ marginTop: 12 }}>
            Envoyez-lui son lien de suivi personnel. Il y consultera sa
            progression, ses séances et son solde, sans rien installer.
          </p>
          <input readOnly value={nouveauLien.lien} onFocus={(e) => e.target.select()} />
          <div className="actions" style={{ marginTop: 12 }}>
            <a
              className="bouton"
              href={lienWhatsApp(
                nouveauLien.eleve.telephone,
                `Bonjour ${nouveauLien.eleve.prenoms}, voici votre espace personnel de suivi : ${nouveauLien.lien}`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Envoyer par WhatsApp
            </a>
            <button
              type="button"
              className="bouton doux"
              onClick={() => setNouveauLien(null)}
            >
              Fermer
            </button>
          </div>
        </Feuille>
      )}
    </>
  );
}

function FormulaireInscription({
  onFermer, onCree,
}: { onFermer: () => void; onCree: (eleve: Eleve, lien: string) => void }) {
  const { envoi, erreur, executer } = useEnvoi();
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [telephoneTuteur, setTelephoneTuteur] = useState("");
  const [cni, setCni] = useState("");
  const [commune, setCommune] = useState("");
  const [categorie, setCategorie] = useState<Categorie>("B");
  const [montantTotal, setMontantTotal] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    await executer(async () => {
      const eleve = await api.post<Eleve>("/api/eleves", {
        nom, prenoms, telephone, telephoneTuteur, cni, commune, categorie,
        montantTotal: Number(montantTotal) || 0,
      });
      const lien = lienPortail(eleve.portailJeton ?? "");
      onCree(eleve, lien);
    });
  }

  return (
    <Feuille titre="Inscrire un élève" onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <Champ etiquette="Nom">
          <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={120} />
        </Champ>
        <Champ etiquette="Prénoms">
          <input value={prenoms} onChange={(e) => setPrenoms(e.target.value)} required maxLength={120} />
        </Champ>
        <Champ etiquette="Téléphone" aide="10 chiffres, sans indicatif">
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
            inputMode="tel"
            placeholder="07 01 02 03 04"
          />
        </Champ>
        <Champ etiquette="Téléphone du tuteur (facultatif)">
          <input
            value={telephoneTuteur}
            onChange={(e) => setTelephoneTuteur(e.target.value)}
            inputMode="tel"
          />
        </Champ>
        <Champ etiquette="Numéro CNI (facultatif)">
          <input value={cni} onChange={(e) => setCni(e.target.value)} maxLength={40} />
        </Champ>
        <Champ etiquette="Commune">
          <input value={commune} onChange={(e) => setCommune(e.target.value)} maxLength={120} />
        </Champ>
        <Champ etiquette="Catégorie de permis">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value as Categorie)}>
            {(Object.keys(LIBELLE_CATEGORIE) as Categorie[]).map((c) => (
              <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>
            ))}
          </select>
        </Champ>
        <Champ
          etiquette="Montant de la formation (FCFA)"
          aide="Laisser vide pour reprendre le tarif de la catégorie."
        >
          <input
            value={montantTotal}
            onChange={(e) => setMontantTotal(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="150000"
          />
        </Champ>

        {erreur && <Message ton="erreur">{erreur}</Message>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Inscrire"}
          </button>
        </div>
      </form>
    </Feuille>
  );
}
