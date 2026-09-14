# CLAUDE.md — Go Permis 225

> Contexte projet pour Claude Code. Lis ce fichier avant toute modification.
> Réponds et commente le code **en français**. L'application cible les
> auto-écoles de Côte d'Ivoire.

## 1. Ce qu'est Go Permis 225

Application web de gestion d'auto-école. Quatre usages :

- le **directeur** (`role = "directeur"`) est souverain sur **sa seule** école ;
- la **secrétaire** (`role = "secretaire"`) inscrit, planifie, encaisse ;
- le **moniteur** (`role = "moniteur"`) voit son planning et clôture ses séances ;
- l'**élève** consulte son dossier via un lien personnel, sans compte.

Côté session : `cote = "ecole"` (personnel) ou `cote = "eleve"` (portail).

## 2. Architecture — ne pas la deviner

- **Backend** : FastAPI + MongoDB (`motor`). `backend/server.py` assemble les
  routeurs ; la logique vit dans `lib/` et `routers/`.
- **Frontend** : React 18 + TypeScript + Vite. Pas de librairie d'UI ni de
  gestion d'état : `session.tsx` et `hooks.ts` suffisent.
- **Auth** : JWT `HS256`. Personnel `{sub, ecoleId, cote:"ecole", role, nom}`,
  élève `{sub, ecoleId, cote:"eleve", nom}`.

Fichiers clés :

- `backend/lib/metier.py` — **module pur**, sans base ni réseau : solde,
  progression, conflits de planning, salaire, alertes véhicule, KPI. C'est ici
  qu'on teste la logique, et nulle part ailleurs.
- `backend/lib/autorisation.py` — la matrice des rôles, avec sa table en
  en-tête. Seule autorité en matière de droits.
- `backend/lib/depot.py` — `filtre()`, `lire_un()`, `lister()` : toute requête
  passe par là et se retrouve bornée à l'école appelante.
- `backend/lib/securite.py` — PBKDF2, JWT, `VerrouConnexion`.
- `backend/lib/db.py` — collections, index, `pour_mongo()`.
- `frontend/src/api.ts` — client HTTP unique (jeton, erreurs, session perdue).
- `frontend/src/format.ts` — `fFCFA`, `fDate`, libellés. Ne pas reformater à la main.

## 3. Commandes

```bash
# Backend (dossier backend/)
./.venv/bin/python -m pytest          # 65 tests, en processus, sans réseau
./.venv/bin/uvicorn server:app --reload

# Frontend (dossier frontend/)
yarn typecheck                        # doit rester à zéro erreur
yarn build
yarn dev

# Démonstration sans MongoDB
backend/.venv/bin/python scripts/demo.py
```

## 4. Invariants métier — NE JAMAIS CASSER

1. **Cloisonnement entre auto-écoles.** Le serveur force l'`ecoleId` du jeton
   sur chaque écriture et le filtre sur chaque lecture. Une école ne doit
   JAMAIS voir ni écrire les données d'une autre. C'est la garantie la plus
   importante. Une ressource d'une autre école répond **404, pas 403** : un 403
   confirmerait son existence.
2. **Autorisation côté serveur**, refus par défaut. Les garde-fous d'interface
   sont cosmétiques. Toute nouvelle route doit appeler explicitement un garde
   (`exiger_gestion`, `exiger_directeur`…).
3. **Un moniteur ne voit que ses élèves** — ceux avec qui il a une séance — et
   ne modifie que ses propres séances, sur `statut`, `motif`, `kilometrage`.
4. **L'empreinte du mot de passe ne quitte jamais le serveur**, pour aucun rôle.
5. **Le jeton de portail vaut mot de passe** : renvoyé à la création et à la
   régénération, jamais dans une liste ni dans un détail.
6. **Argent en entiers de francs CFA.** Jamais de flottant. Toujours passer par
   `fFCFA` à l'affichage.
7. **Aucun total n'est stocké.** Solde, progression et KPI sont recalculés
   depuis les enregistrements. Un cumul stocké finit toujours par diverger.
8. **Le reste à payer n'est jamais négatif**, et un trop-perçu est exposé à
   part (`tropPercu`) plutôt que masqué par un `max(0)` silencieux.
9. **Le montant dû est figé à l'inscription.** Changer un tarif d'école
   n'affecte que les inscriptions à venir.
10. **Idempotence des encaissements.** Toute écriture financière porte un
    `clientOpId` ; une seconde requête avec le même renvoie le paiement
    existant. Ne jamais créer d'écriture financière sans.
11. **Numéro de reçu figé à l'émission** (`REC-<TAG>-000123`), issu d'un
    compteur atomique propre à l'école. Jamais recalculé à l'affichage.
12. **Seules les séances `effectuee` comptent** comme heures faites, dans la
    progression de l'élève comme dans le salaire du moniteur.
13. **Deux séances sont en conflit** si elles se chevauchent pour le même
    moniteur ou le même véhicule. Le contact bord à bord (10h–11h, 11h–12h)
    n'est pas un conflit. Une séance annulée ne bloque rien.
14. **Une annulation ou une absence exige un motif.** Une séance `effectuee`
    ne se supprime pas : elle porte des heures comptées.
15. **Statuts élève** (valeurs exactes) : `"actif"`, `"suspendu"`, `"diplome"`,
    `"abandon"`, `"recale"`. Statuts séance : `"planifiee"`, `"effectuee"`,
    `"annulee"`, `"absent"`. Ne pas introduire d'autre orthographe.
16. **Anti-force-brute sur toute vérification de secret.** Le verrou porte sur
    l'**identifiant tenté**, jamais sur l'IP (derrière un ingress toutes les
    requêtes la partagent, et `X-Forwarded-For` est falsifiable). Un compte
    inconnu doit consommer le même temps de calcul qu'un mauvais mot de passe
    (`bruler_temps_secret`), sinon la durée de réponse révèle quels comptes
    existent.
17. **Secrets hachés en PBKDF2-HMAC-SHA256** (210 000 itérations). Ne pas régresser.
18. **Les dates sont persistées en chaînes ISO** — BSON n'encode pas
    `datetime.date`. Toute lecture d'une date doit passer par `_en_date`, qui
    accepte `date`, `datetime` et chaîne. Une fonction qui n'accepterait que
    des objets `date` ne se déclencherait jamais en production : c'est
    exactement le bug qu'avaient les alertes véhicule.
19. **Audit posé par le serveur.** L'acteur et l'horodatage viennent de la
    session, jamais du client.
20. **Un directeur ne peut pas se désactiver** ni se retirer son rôle : l'école
    se retrouverait sans personne pour réactiver quoi que ce soit.
21. **Une convocation est un document remis à un tiers.** Sa référence
    (`CGI-<année>-0001`) est figée à l'émission et la progression constatée y
    est recopiée : la fiche doit rester fidèle à ce qui a été signé, même si
    l'élève continue ses heures ensuite. Une seule fiche par élève et par
    épreuve — la vérification est relançable sans précaution.
22. **Tout message sortant porte une clé de déduplication déterministe**
    (`impaye:<eleveId>:<palier>`, `rappel:<seanceId>`…). Relancer la
    préparation ne doit jamais produire deux fois le même message : un élève
    relancé trois fois le même jour cesse de lire. Un seul palier de relance
    est retenu à la fois — le plus élevé atteint.
23. **La page d'entrée n'est jamais mise en cache par le navigateur**
    (`Cache-Control: no-cache, must-revalidate`, posé par `InterfaceStatique`
    dans `server.py`). Elle garde toujours le même nom et pointe vers les
    fichiers du moment : mise en cache, elle fige l'application sur une
    version périmée, y compris après un rechargement forcé. Les fichiers
    construits portent un nom haché et sont, eux, gardés un an.
24. **L'application ne suppose jamais être servie à la racine d'un domaine.**
    Elle doit fonctionner sous un préfixe (`/proxy/8000/`, un sous-dossier, un
    aperçu d'hébergeur). Trois choix le garantissent : `base: "./"` dans
    `vite.config.ts`, `urlApi()` qui résout contre `document.baseURI`, et
    `HashRouter`. **Ne jamais réintroduire un chemin absolu** — ni `/api/…`
    dans une requête, ni `window.location.origin + "/route"` pour fabriquer un
    lien : passer par `urlApi()` et `lienPortail()`. Une page blanche sous
    préfixe est exactement le symptôme de cette erreur.

## 5. Reste à faire

- **Envoi WhatsApp automatique.** La file est construite
  (`routers/whatsapp.py`) : les messages sont rédigés, dédupliqués et mis en
  attente selon quatre règles. Il manque le **fournisseur** — un compte
  WhatsApp Business, un numéro vérifié et des gabarits approuvés par Meta. Le
  jour où il existe, il se branche derrière `statut = "en_attente"` ; rien
  d'autre n'est à réécrire. Ne pas afficher « livré » tant qu'aucun accusé de
  réception n'est reçu : aujourd'hui « envoyé » est déclaratif, et l'interface
  le dit.
- **Paiement en ligne** Orange Money / Wave : demande un contrat marchand.
- **Attestation de fin de formation** et **fiche de paie** en PDF. Le reçu de
  paiement et la convocation d'examen, eux, sont faits (`lib/documents.py`,
  ReportLab) — reprendre le même style d'en-tête et de pied de page.
- **Multi-agences.** Le modèle porte déjà `ecoleId` partout ; il faudrait
  ajouter un niveau `agenceId` et un tableau de bord consolidé.
- **Plan de paiement.** Le modèle `PlanPaiement` existe, les routes non.
- **Révocation de jeton.** Un jeton personnel vit 12 h et rien ne permet de le
  révoquer avant expiration. Le jeton de portail, lui, se révoque en
  régénérant le lien.
- **Verrou de connexion en mémoire.** Remis à zéro au redémarrage et non
  partagé entre instances : passer sur Redis si l'application est répliquée.

## 5 bis. Présentation

L'interface est un **poste de travail** : barre latérale permanente, tableaux
denses, chiffres à chasse fixe (`.mono`, `font-variant-numeric: tabular-nums`)
pour que les colonnes de montants s'alignent à l'œil. Sous 860 px, la barre
latérale devient une barre d'onglets en bas — un moniteur consulte son planning
sur le terrain, pas devant un écran.

Trois espaces distincts, à ne pas mélanger :

| Espace | Adresses | Qui |
|---|---|---|
| Vitrine publique | `#/` | visiteur non connecté |
| Espace de gestion | `#/tableau-de-bord`, `#/eleves`… | personnel authentifié |
| Portail élève | `#/portail`, `#/portail/<jeton>` | élève, lecture seule |

Quand tableau, quand fiche :

- **tableau** (`<Grille>`) quand les lignes se comparent colonne par colonne —
  élèves, encaissements, convocations, journal ;
- **fiche** (`.fiches` / `.fiche`) quand une entité porte des valeurs de natures
  différentes qu'une ligne écraserait — véhicule, moniteur, journée de planning.

Conventions d'écriture :

- les formulaires s'ouvrent dans un **volet latéral** (`<Volet>`), jamais dans
  une boîte modale centrée : la liste reste visible derrière ;
- les listes passent par `<Grille>` ; les cartes de chiffres par
  `<Indicateur>` ; les blocs par `<Bloc>` ;
- aucune photographie n'est embarquée. Les visuels sont construits en CSS —
  une image de banque d'images poserait une question de droits que
  l'auto-école n'a pas à hériter ;
- un document protégé se télécharge par `telecharger()` de `api.ts`, jamais par
  un `<a href>` : un lien n'emporte pas l'en-tête `Authorization` et recevrait
  un 401.

## 6. Conventions

- **Textes d'interface et commentaires en français.**
- **Types d'abord** : modifier `backend/models/` et `frontend/src/types.ts`
  avant de toucher un écran.
- **Toute nouvelle route** doit appeler un garde d'autorisation explicite et,
  si elle écrit, émettre un `journaliser`.
- **Toute nouvelle collection** doit être déclarée dans `lib/db.py` avec ses
  index — préfixés par `ecoleId` pour les contraintes d'unicité, sinon deux
  écoles ne pourraient pas avoir le même matricule.
- **Tests** : un test backend pour tout correctif de logique ou de sécurité.
  La logique pure va dans `lib/metier.py` et se teste dans
  `tests/test_metier.py`, sans base.
- **Ne pas dégrader la sécurité pour « faire marcher »** : si un correctif
  casse un test d'isolation ou d'autorisation, c'est le correctif qui est faux.

## 7. Ce qu'il ne faut PAS faire

- Ne pas faire confiance au client sur l'`ecoleId`, le rôle, l'acteur d'un
  audit ou un horodatage.
- Ne pas répondre `403` pour une ressource d'une autre école (fuite d'existence).
- Ne pas stocker de total calculable.
- Ne pas écrire une date en objet `date` dans Mongo sans passer par
  `pour_mongo()`.
- Ne pas committer de `.env` ni de `MONGO_URL` réel.
