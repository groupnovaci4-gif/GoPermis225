# Go Permis 225

Application web de gestion pour les auto-écoles de Côte d'Ivoire.

Le **directeur** pilote son école, la **secrétaire** inscrit les élèves et tient
la caisse, le **moniteur** consulte son planning et clôture ses séances, et
l'**élève** suit sa progression depuis un lien personnel reçu par WhatsApp —
sans rien installer.

Tout est en francs CFA, en français, et pensé pour un téléphone d'entrée de
gamme : la page pèse 70 ko compressés.

## Démarrage rapide

### Backend

```bash
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Générer un secret et le coller dans .env :
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
./.venv/bin/uvicorn server:app --reload
```

Le serveur **refuse de démarrer** sans `JWT_SECRET` (32 caractères minimum).
C'est délibéré : mieux vaut un échec bruyant au démarrage qu'une application
qui signe ses jetons avec un secret devinable.

Variables d'environnement — voir `backend/.env.example` :

| Variable | Rôle |
|---|---|
| `MONGO_URL`, `DB_NAME` | Connexion MongoDB |
| `JWT_SECRET` | **Obligatoire.** Signature des jetons |
| `JWT_EXPIRE_MINUTES` | Durée de session du personnel (720 = 12 h) |
| `CORS_ORIGINS` | Origines autorisées, séparées par des virgules |
| `LOGIN_MAX_FAILS`, `LOGIN_LOCK_SECONDS` | Verrou anti-force-brute |

### Frontend

Deux façons de le lancer.

**Pour développer** — rechargement à chaud, deux ports :

```bash
cd frontend
yarn install
yarn dev        # http://localhost:5173, proxy /api vers le port 8000
```

**Pour montrer ou déployer** — un seul port, et c'est la seule façon qui
fonctionne derrière un proxy de chemin (aperçu d'hébergeur, sous-dossier) :

```bash
cd frontend && yarn install && yarn build
```

L'API sert alors `frontend/dist/` elle-même : tout est accessible sur le port
du backend, sans CORS. Voir « Servir sous un préfixe » plus bas.

### Démonstration sans MongoDB

```bash
backend/.venv/bin/python scripts/demo.py
```

Lance l'API sur une base **en mémoire** avec un jeu de données :
directeur `0701020304` / `demo1234`, moniteur `0708080808` / `demo1234`.
Les données disparaissent à l'arrêt — pour la démonstration uniquement.

Les identifiants internes du jeu de démonstration sont **fixes**. La base
étant en mémoire, chaque redémarrage la recrée : avec des identifiants tirés
au hasard, la session gardée par le navigateur désignait une auto-école qui
n'existait plus, et l'application s'affichait connectée mais entièrement vide.

Le serveur écoute sur `0.0.0.0:8000` : dans un conteneur, un aperçu
d'hébergeur se connecte depuis l'extérieur de la boucle locale, et n'écouter
que sur `127.0.0.1` donne un « connexion refusée » alors que le serveur
tourne. Changer avec `HOTE` et `PORT` si besoin.

## Commandes

| Commande | Effet |
|---|---|
| `cd backend && ./.venv/bin/python -m pytest` | 65 tests, sans serveur ni réseau |
| `cd frontend && yarn typecheck` | Vérification TypeScript (doit rester à zéro erreur) |
| `cd frontend && yarn build` | Construction de production dans `dist/` |

Les tests backend tournent **en processus** : MongoDB est simulée par
`mongomock_motor`. Aucun service à lancer avant.

## Architecture

```
backend/
  server.py          Point d'entrée FastAPI
  lib/
    config.py        Configuration, échec au démarrage si secret manquant
    securite.py      PBKDF2, JWT, verrou anti-force-brute
    autorisation.py  Matrice des rôles — la seule autorité
    metier.py        Calculs purs : argent, progression, conflits, KPI
    depot.py         Requêtes toujours bornées à l'auto-école appelante
    db.py            Collections, index, sérialisation des dates
    journal.py       Journal d'audit
  models/            Types du domaine (Pydantic)
  routers/           Routes HTTP
frontend/src/
  api.ts             Client HTTP unique
  session.tsx        Session, rôle, persistance
  metier → format.ts Formatage argent/dates
  pages/             Un écran par module
```

### Modules couverts

| Module du cahier des charges | État |
|---|---|
| Gestion des élèves | Fiche, statuts + historique motivé, progression, lien portail |
| Comptabilité & paiements | Encaissements idempotents, reçus numérotés, impayés, dépenses |
| Planning & séances | Semaine, détection de conflits, clôture, motifs obligatoires |
| Gestion du parc auto | Fiches, alertes d'échéance, journal d'entretien |
| Tableau de bord directeur | KPI, revenus 12 mois, élèves prêts, performance moniteurs |
| Gestion des moniteurs | Fiches, compteur d'heures, salaire calculé |
| Espace élève | Lien unique révocable, progression, solde, séances |
| Convocations CGI | Fiches établies à 80 % des heures, référence figée, PDF |
| File WhatsApp | Messages préparés et dédupliqués, envoi assisté en un clic |

Documents PDF : reçu de paiement et fiche de présentation à l'examen.

Pas encore construits : l'envoi WhatsApp **automatique** (la file existe, il
manque le compte WhatsApp Business), le paiement en ligne Orange Money / Wave,
l'attestation de fin de formation et la fiche de paie en PDF, le multi-agences.
Voir `CLAUDE.md`.

## Photographies

Déposez vos images dans `frontend/public/images/` puis relancez `yarn build` :
`heros.jpg`, `conduite.jpg`, `ville.jpg` (vitrine) et `connexion.jpg` (page de
connexion, cadrage portrait). Elles apparaissent sans modification de code.

Les emplacements fonctionnent sans elles : un dégradé de repli occupe la place
et la page reste correcte. Détails et formats conseillés dans
`frontend/public/images/README.md`.

## Sécurité

Les garde-fous de l'interface sont cosmétiques : n'importe qui peut appeler
l'API directement. Tout ce qui compte est côté serveur.

1. **Cloisonnement entre auto-écoles.** Chaque document porte un `ecoleId` que
   le serveur pose depuis le jeton, jamais depuis la requête. Une ressource
   d'une autre école répond `404`, pas `403` : un `403` confirmerait qu'elle
   existe.
2. **Autorisation par rôle**, refus par défaut (`lib/autorisation.py`).
3. **Anti-force-brute** sur toute vérification de secret, verrou par
   identifiant tenté et temps de calcul constant pour un compte inconnu.
4. **Secrets en PBKDF2-HMAC-SHA256**, 210 000 itérations. L'empreinte ne quitte
   jamais le serveur.
5. **Encaissements idempotents** via `clientOpId` : un réseau qui coupe ne peut
   pas débiter un élève deux fois.
6. **Journal d'audit** dont l'auteur et l'horodatage sont posés par le serveur.

## Déploiement

Construire le frontend (`yarn build`) puis lancer le backend : l'API sert
elle-même `frontend/dist/`. Un seul port à exposer, une seule origine, donc
aucune question de CORS. Pour héberger le frontend séparément, renseigner
`CORS_ORIGINS` côté backend et `VITE_API_URL` côté frontend.

### Servir sous un préfixe

L'application fonctionne telle quelle à la racine d'un domaine **comme** sous
un préfixe de chemin — `https://exemple.com/proxy/8000/`, un sous-dossier, un
aperçu d'hébergeur. Trois choix rendent cela possible, à ne pas défaire :

1. `base: "./"` dans `vite.config.ts` — les fichiers sont demandés en relatif ;
2. `urlApi()` dans `src/api.ts` résout les appels contre `document.baseURI`
   plutôt que par un chemin absolu `/api/…` ;
3. le routage passe par `HashRouter` — les adresses vivent après un `#`, donc
   elles survivent à n'importe quel préfixe **et** l'hébergeur n'a aucune règle
   de réécriture à configurer.

Un chemin absolu réintroduit ailleurs dans le code casserait les trois.
