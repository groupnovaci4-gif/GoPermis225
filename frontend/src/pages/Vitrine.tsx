/** Page publique de présentation.
 *
 * Aucune photographie n'est embarquée : les visuels sont construits en CSS.
 * C'est volontaire — une image de banque d'images pose une question de droits
 * que l'auto-école ne doit pas hériter. Les emplacements sont prévus pour
 * accueillir vos propres photos (voir README).
 */

import { Link } from "react-router-dom";

import { Illustration } from "../components/Illustration";

const ATOUTS = [
  {
    glyphe: "◲",
    titre: "Dossiers élèves numériques",
    texte: "Identité, CNI, commune, heures de code et de conduite, résultats d'examen — au même endroit, consultable de partout.",
  },
  {
    glyphe: "◳",
    titre: "Caisse et créances en FCFA",
    texte: "Encaissements en espèces, Wave, Orange Money, MTN ou Moov. Reçu numéroté et solde recalculé à l'instant.",
  },
  {
    glyphe: "◰",
    titre: "Planning sans double réservation",
    texte: "Vue semaine par moniteur, avec détection automatique des conflits de moniteur et de véhicule.",
  },
  {
    glyphe: "◴",
    titre: "Flotte sous contrôle",
    texte: "Alertes d'assurance et de visite technique, kilométrage et journal d'entretien par véhicule.",
  },
  {
    glyphe: "◵",
    titre: "Paie des moniteurs",
    texte: "Heures validées cumulées automatiquement, rémunération calculée selon le tarif horaire de chacun.",
  },
  {
    glyphe: "◱",
    titre: "Espace élève",
    texte: "Un lien personnel envoyé par WhatsApp : l'élève voit sa progression, ses séances et son solde. Rien à installer.",
  },
];

export default function Vitrine() {
  return (
    <div className="vitrine">
      <header className="vitrine-tete">
        <div className="marque">
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em" }}>GO PERMIS 225</div>
          <div className="sous-titre faible" style={{ letterSpacing: ".13em", textTransform: "uppercase", fontSize: 9.5 }}>
            Auto-école · Côte d'Ivoire
          </div>
        </div>
        <Link to="/connexion" className="bouton doux">Se connecter</Link>
        <Link to="/connexion?creer=1" className="bouton">Créer une auto-école</Link>
      </header>

      <section>
        <div className="dedans heros">
          <div>
            <div className="sur-titre">Logiciel de gestion d'auto-école</div>
            <h1 style={{ marginTop: 10 }}>
              Pilotez votre auto-école, <em>sans un seul cahier</em>.
            </h1>
            <p className="accroche">
              Élèves, encaissements en FCFA, planning des séances, flotte automobile
              et paie des moniteurs — Go Permis 225 réunit toute la gestion
              quotidienne d'une auto-école ivoirienne dans une seule interface.
            </p>
            <div className="ligne-flex" style={{ gap: 10 }}>
              <Link to="/connexion?creer=1" className="bouton large" style={{ width: "auto" }}>
                Créer une auto-école
              </Link>
              <Link to="/connexion" className="bouton doux large" style={{ width: "auto" }}>
                Accéder à mon espace
              </Link>
            </div>
            <p className="faible" style={{ marginTop: 14 }}>
              Chaque auto-école dispose d'un espace privé — vos données ne sont
              jamais partagées avec une autre école.
            </p>

            <div className="chiffres">
              <div>
                <div className="n">7</div>
                <div className="l">modules métier</div>
              </div>
              <div>
                <div className="n">6</div>
                <div className="l">moyens de paiement</div>
              </div>
              <div>
                <div className="n">3</div>
                <div className="l">rôles cloisonnés</div>
              </div>
            </div>
          </div>

          <div className="photo" style={{ minHeight: 330 }}>
            <Illustration nom="heros.jpg" alt="Une élève au volant, à Abidjan" />
            <div className="photo-encart">
              <div className="sur-titre">Ce mois-ci</div>
              <div className="mono" style={{ fontSize: 21, fontWeight: 650, color: "var(--vert)" }}>
                1 245 000
              </div>
              <div className="faible">FCFA encaissés · 12 élèves actifs</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="dedans" style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr" }}>
          <div className="temoignage">
            <div className="photo" style={{ minHeight: 300 }}>
              <Illustration nom="conduite.jpg" alt="Une leçon de conduite" position="center 40%" />
              <div className="legende">
                <div className="sur-titre">Du premier cours au permis</div>
                <p>
                  « J'ai eu mon permis en 6 semaines. Mon auto-école suivait mes
                  heures et mes paiements sur son téléphone. »
                </p>
                <div className="signature">Kouadio B. — Yopougon, Abidjan</div>
              </div>
            </div>
            <div className="temoignage-cote">
              <div className="carte" style={{ background: "var(--vert-pale)", borderColor: "transparent" }}>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Conçu pour les réalités locales : paiements mobiles Wave, Orange
                  Money et MTN, relances par WhatsApp, convocations CGI et communes
                  d'Abidjan.
                </p>
              </div>
              <div className="photo" style={{ minHeight: 190 }}>
                <Illustration nom="ville.jpg" alt="Circulation à Abidjan" />
                <div className="legende">
                  <p style={{ fontSize: 12.5 }}>
                    Formez des conducteurs prêts pour le trafic d'Abidjan.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bande">
        <div className="dedans">
          <div className="sur-titre">Ce que couvre la plateforme</div>
          <h2 style={{ fontSize: 26, marginTop: 8, letterSpacing: "-.02em" }}>
            Une réponse à chaque tâche qui vous mange vos journées
          </h2>
          <div className="cartes">
            {ATOUTS.map((a) => (
              <article key={a.titre} className="carte">
                <div className="glyphe" aria-hidden="true">{a.glyphe}</div>
                <h3>{a.titre}</h3>
                <p>{a.texte}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="dedans">
          <div className="sur-titre">Conçu pour les réalités locales</div>
          <div className="cartes" style={{ marginTop: 18 }}>
            <article className="carte">
              <h3>Paiements mobiles d'abord</h3>
              <p>
                Wave, Orange Money, MTN et Moov Money sont des moyens de paiement
                de plein droit, avec leur référence de transaction — pas une case
                « autre » en bas d'un formulaire.
              </p>
            </article>
            <article className="carte">
              <h3>Relances par WhatsApp</h3>
              <p>
                Un impayé, un lien de suivi à transmettre : le message part
                pré-rempli vers le numéro de l'élève, sur l'outil qu'il utilise
                déjà tous les jours.
              </p>
            </article>
            <article className="carte">
              <h3>Le franc CFA, en entier</h3>
              <p>
                Tous les montants sont des entiers de francs CFA. Aucun arrondi
                flottant ne vient fausser une caisse d'un franc.
              </p>
            </article>
          </div>
        </div>
      </section>

      <footer className="pied">
        <div className="dedans ligne-flex espace" style={{ flexWrap: "wrap", gap: 10 }}>
          <span>Go Permis 225 — gestion d'auto-école, Côte d'Ivoire</span>
          <Link to="/connexion">Accéder à mon espace</Link>
        </div>
      </footer>
    </div>
  );
}
