/** File WhatsApp : messages préparés, prêts à partir.
 *
 * L'application ne parle pas à l'API WhatsApp Business — cela demande un
 * compte Meta, un numéro vérifié et des gabarits approuvés. Elle prépare les
 * messages et les ouvre dans WhatsApp en un clic ; la ligne passe alors en
 * « envoyé ». C'est une trace déclarative, pas un accusé de réception, et
 * l'interface le dit plutôt que d'afficher un faux « livré ».
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Atelier } from "../components/Atelier";
import { Avis, Bloc, Chargement, Desert, Grille, Indicateur, Jeton } from "../components/ui";
import { LIBELLE_MOTIF, fDateHeure, lienWhatsApp } from "../format";
import { useChargement, useEnvoi } from "../hooks";
import type { MessageWhatsApp, MotifMessage, StatutMessage } from "../types";

const TON_MOTIF: Record<MotifMessage, "vert" | "orange" | "bleu" | undefined> = {
  rappel_seance: "bleu",
  relance_impaye: "orange",
  convocation: "vert",
  felicitations: "vert",
  lien_portail: undefined,
  libre: undefined,
};

export default function Whatsapp() {
  const { envoi, erreur: erreurPrep, executer } = useEnvoi();
  const [onglet, setOnglet] = useState<StatutMessage>("en_attente");
  const [resultat, setResultat] = useState<string | null>(null);

  const { donnees, chargement, erreur, recharger } = useChargement<MessageWhatsApp[]>(
    () => api.get<MessageWhatsApp[]>("/api/whatsapp"), [],
  );

  const messages = (donnees ?? []).filter((m) => m.statut === onglet);
  const enAttente = (donnees ?? []).filter((m) => m.statut === "en_attente");
  const envoyes = (donnees ?? []).filter((m) => m.statut === "envoye");

  async function preparer() {
    setResultat(null);
    const ok = await executer(async () => {
      const reponse = await api.post<{ prepares: number }>("/api/whatsapp/preparer");
      setResultat(
        reponse.prepares === 0
          ? "Rien de nouveau à envoyer aujourd'hui."
          : `${reponse.prepares} message(s) mis en file.`,
      );
    });
    if (ok) recharger();
  }

  /** Ouvre WhatsApp avec le message pré-rempli, puis marque la ligne envoyée. */
  async function envoyerPuisMarquer(m: MessageWhatsApp) {
    window.open(lienWhatsApp(m.telephone, m.texte), "_blank", "noopener");
    await api.post(`/api/whatsapp/${m.id}/envoye`);
    recharger();
  }

  return (
    <Atelier
      titre="File WhatsApp"
      sous={`${enAttente.length} message(s) en attente · ${envoyes.length} envoyé(s)`}
      outils={
        <button type="button" className="bouton" onClick={preparer} disabled={envoi}>
          {envoi ? "Préparation…" : "↻ Préparer les messages du jour"}
        </button>
      }
    >
      <div className="bandeau-info">
        <span className="glyphe" aria-hidden="true">◐</span>
        <div>
          <div className="titre">Envoi assisté, pas automatique</div>
          <p>
            Les messages sont rédigés et mis en file selon quatre règles : rappel
            de séance la veille, relance d'impayé à 7, 15 et 30 jours,
            convocation établie à transmettre, félicitations pour un permis
            obtenu. « Ouvrir WhatsApp » lance la conversation avec le texte
            pré-rempli — vous appuyez sur Envoyer. L'envoi entièrement
            automatique demande un compte WhatsApp Business vérifié.
          </p>
        </div>
      </div>

      <div className="rangs-3">
        <Indicateur glyphe="◷" libelle="En attente" valeur={enAttente.length} />
        <Indicateur
          glyphe="↗" ton="orange" libelle="Relances d'impayé"
          valeur={enAttente.filter((m) => m.motif === "relance_impaye").length}
        />
        <Indicateur glyphe="✓" ton="vert" libelle="Envoyés" valeur={envoyes.length} />
      </div>

      <div className="onglets-texte">
        {([
          ["en_attente", `En attente (${enAttente.length})`],
          ["envoye", `Envoyés (${envoyes.length})`],
          ["annule", "Annulés"],
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

      {chargement && <Chargement lignes={4} />}
      {erreur && <Avis ton="erreur">{erreur}</Avis>}
      {erreurPrep && <Avis ton="erreur">{erreurPrep}</Avis>}
      {resultat && <Avis ton="succes">{resultat}</Avis>}

      {donnees && (
        <Bloc sansPadding>
          {messages.length === 0 ? (
            <Desert glyphe="◐">
              {onglet === "en_attente"
                ? "Aucun message en attente. Lancez « Préparer les messages du jour »."
                : "Aucun message dans cette catégorie."}
            </Desert>
          ) : (
            <Grille
              colonnes={[
                { cle: "qui", libelle: "Destinataire" },
                { cle: "motif", libelle: "Motif" },
                { cle: "texte", libelle: "Message" },
                { cle: "quand", libelle: onglet === "envoye" ? "Envoyé le" : "En file depuis", droite: true },
                { cle: "act", libelle: "", droite: true },
              ]}
            >
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link
                      to={`/eleves/${m.eleveId}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="nom-primaire">{m.destinataire}</div>
                      <div className="nom-secondaire">{m.telephone}</div>
                    </Link>
                  </td>
                  <td><Jeton ton={TON_MOTIF[m.motif]}>{LIBELLE_MOTIF[m.motif]}</Jeton></td>
                  <td className="faible" style={{ maxWidth: 420 }}>{m.texte}</td>
                  <td className="num droite">
                    {fDateHeure(onglet === "envoye" ? m.envoyeLe : m.creeLe)}
                  </td>
                  <td className="droite" style={{ whiteSpace: "nowrap" }}>
                    {m.statut === "en_attente" ? (
                      <>
                        <button
                          type="button"
                          className="bouton"
                          style={{ padding: "4px 10px", fontSize: 11.5 }}
                          onClick={() => envoyerPuisMarquer(m)}
                        >
                          Ouvrir WhatsApp
                        </button>
                        <button
                          type="button"
                          className="bouton nu"
                          onClick={async () => {
                            await api.delete(`/api/whatsapp/${m.id}`);
                            recharger();
                          }}
                        >
                          Retirer
                        </button>
                      </>
                    ) : (
                      <a
                        className="bouton nu"
                        href={lienWhatsApp(m.telephone, m.texte)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Rouvrir
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </Grille>
          )}
        </Bloc>
      )}
    </Atelier>
  );
}
