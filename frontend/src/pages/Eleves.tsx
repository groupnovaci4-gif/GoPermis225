/** Liste des élèves : tableau dense, recherche, filtre par statut. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import {
  Avis, Barre, Bloc, Champ, Chargement, Desert, Grille, JetonStatutEleve, Volet,
} from "../components/ui";
import { LIBELLE_CATEGORIE, fFCFA, lienPortail, lienWhatsApp } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import { useSession } from "../session";
import type { Categorie, Eleve, StatutEleve } from "../types";

const FILTRES: { valeur: StatutEleve | "tous"; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous les statuts" },
  { valeur: "actif", libelle: "En formation" },
  { valeur: "suspendu", libelle: "Suspendus" },
  { valeur: "diplome", libelle: "Permis obtenu" },
  { valeur: "abandon", libelle: "Abandons" },
  { valeur: "recale", libelle: "Ajournés" },
];

export default function Eleves() {
  const { peutGerer } = useSession();
  const [filtre, setFiltre] = useState<StatutEleve | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [nouveau, setNouveau] = useState<{ eleve: Eleve; lien: string } | null>(null);

  const requete = new URLSearchParams();
  if (filtre !== "tous") requete.set("statut", filtre);
  if (recherche.trim()) requete.set("recherche", recherche.trim());

  const { donnees, chargement, erreur, recharger } = useChargement<Eleve[]>(
    () => api.get<Eleve[]>(`/api/eleves?${requete.toString()}`),
    [filtre, recherche],
  );

  return (
    <Atelier
      titre="Élèves"
      sous={donnees ? `${donnees.length} dossier(s) affiché(s)` : undefined}
      outils={
        peutGerer ? (
          <button type="button" className="bouton" onClick={() => setCreation(true)}>
            Nouvel élève
          </button>
        ) : undefined
      }
    >
      <div className="ligne-flex" style={{ gap: 10, flexWrap: "wrap" }}>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom, un matricule, un téléphone…"
          aria-label="Rechercher un élève"
          style={{ flex: 1, minWidth: 220 }}
        />
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as StatutEleve | "tous")}
          aria-label="Filtrer par statut"
          style={{ width: "auto", minWidth: 165 }}
        >
          {FILTRES.map((f) => (
            <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
          ))}
        </select>
      </div>

      {chargement && <Chargement lignes={6} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}

      {donnees && (
        <Bloc sansPadding>
          {donnees.length === 0 ? (
            <Desert glyphe="◲">
              {recherche
                ? "Aucun élève ne correspond à cette recherche."
                : "Aucun élève pour l'instant."}
            </Desert>
          ) : (
            <Grille
              colonnes={[
                { cle: "eleve", libelle: "Élève" },
                { cle: "statut", libelle: "Statut" },
                { cle: "conduite", libelle: "Conduite" },
                { cle: "solde", libelle: "Solde", droite: true },
                { cle: "fiche", libelle: "Fiche", droite: true },
              ]}
            >
              {donnees.map((e) => {
                const faites = e.progression?.heuresConduiteFaites ?? 0;
                const prevues = e.progression?.heuresConduitePrevues ?? 0;
                const part = prevues === 0 ? 0 : Math.round((faites / prevues) * 100);
                const reste = e.solde?.reste ?? 0;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="nom-primaire">{e.prenoms} {e.nom}</div>
                      <div className="nom-secondaire">
                        {e.telephone}
                        {e.commune ? ` · ${e.commune}` : ""} · Permis {e.categorie}
                      </div>
                    </td>
                    <td><JetonStatutEleve statut={e.statut} /></td>
                    <td style={{ minWidth: 160 }}>
                      <Barre pourcentage={part} ton={part < 40 ? "orange" : undefined} />
                      <div className="nom-secondaire" style={{ marginTop: 3 }}>
                        {faites}/{prevues} h
                      </div>
                    </td>
                    <td
                      className="num droite"
                      style={{ color: reste > 0 ? "var(--orange)" : "var(--vert)", fontWeight: 600 }}
                    >
                      {fFCFA(reste)}
                    </td>
                    <td className="droite">
                      <Link to={`/eleves/${e.id}`} className="lien-fiche">Ouvrir</Link>
                    </td>
                  </tr>
                );
              })}
            </Grille>
          )}
        </Bloc>
      )}

      {creation && (
        <VoletInscription
          onFermer={() => setCreation(false)}
          onCree={(eleve, lien) => {
            setCreation(false);
            setNouveau({ eleve, lien });
            recharger();
          }}
        />
      )}

      {nouveau && (
        <Volet titre="Élève inscrit" onFermer={() => setNouveau(null)}>
          <Avis ton="succes">
            {nouveau.eleve.prenoms} {nouveau.eleve.nom} — matricule{" "}
            <strong className="mono">{nouveau.eleve.matricule}</strong>
          </Avis>
          <p className="faible" style={{ marginTop: 14 }}>
            Transmettez-lui son lien de suivi personnel. Il y consultera sa
            progression, ses séances et son solde, sans rien installer.
          </p>
          <input readOnly value={nouveau.lien} onFocus={(e) => e.target.select()} />
          <div className="actions" style={{ marginTop: 12 }}>
            <a
              className="bouton"
              href={lienWhatsApp(
                nouveau.eleve.telephone,
                `Bonjour ${nouveau.eleve.prenoms}, voici votre espace personnel de suivi : ${nouveau.lien}`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Envoyer par WhatsApp
            </a>
            <button type="button" className="bouton doux" onClick={() => setNouveau(null)}>
              Fermer
            </button>
          </div>
        </Volet>
      )}
    </Atelier>
  );
}

function VoletInscription({
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
      onCree(eleve, lienPortail(eleve.portailJeton ?? ""));
    });
  }

  return (
    <Volet titre="Inscrire un élève" onFermer={onFermer}>
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
          <input value={commune} onChange={(e) => setCommune(e.target.value)} maxLength={120} placeholder="Yopougon" />
        </Champ>
        <Champ etiquette="Catégorie de permis">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value as Categorie)}>
            {(Object.keys(LIBELLE_CATEGORIE) as Categorie[]).map((c) => (
              <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>
            ))}
          </select>
        </Champ>
        <Champ
          etiquette="Frais de formation (FCFA)"
          aide="Laisser vide pour reprendre le tarif de la catégorie."
        >
          <input
            value={montantTotal}
            onChange={(e) => setMontantTotal(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="150000"
          />
        </Champ>

        {erreur && <Avis ton="erreur">{erreur}</Avis>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="bouton doux" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Inscrire"}
          </button>
        </div>
      </form>
    </Volet>
  );
}

