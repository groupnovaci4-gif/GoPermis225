/** Client HTTP de l'API.
 *
 * Un seul point de passage pour toutes les requêtes : c'est là qu'on attache
 * le jeton, qu'on traduit les erreurs et qu'on détecte une session expirée.
 */

const BASE = import.meta.env.VITE_API_URL ?? "";

/** Adresse complète d'un point d'entrée de l'API.
 *
 * Un chemin absolu « /api/… » perdrait le préfixe sous lequel l'application
 * est servie (sous-dossier, proxy de chemin). On résout donc relativement à
 * la base du document, ce qui fonctionne à la racine comme sous un préfixe.
 */
function urlApi(chemin: string): string {
  if (BASE) return `${BASE}${chemin}`;
  return new URL(chemin.replace(/^\//, ""), document.baseURI).toString();
}

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly corps?: unknown,
  ) {
    super(message);
    this.name = "ErreurApi";
  }

  /** Session expirée ou jeton invalide : il faut se reconnecter. */
  get sessionPerdue(): boolean {
    return this.statut === 401;
  }
}

type Methode = "GET" | "POST" | "PATCH" | "DELETE";

let jetonCourant: string | null = null;
let surSessionPerdue: (() => void) | null = null;

export function definirJeton(jeton: string | null): void {
  jetonCourant = jeton;
}

export function surPerteDeSession(rappel: () => void): void {
  surSessionPerdue = rappel;
}

/** Extrait un message lisible depuis une réponse d'erreur FastAPI. */
function messageErreur(corps: unknown, statut: number): string {
  if (typeof corps === "string" && corps) return corps;
  if (corps && typeof corps === "object") {
    const detail = (corps as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    // Conflit de planning : le détail est un objet structuré.
    if (detail && typeof detail === "object") {
      const message = (detail as { message?: string }).message;
      if (message) return message;
    }
    // Erreur de validation Pydantic : liste de problèmes par champ.
    if (Array.isArray(detail)) {
      const premier = detail[0] as { msg?: string } | undefined;
      if (premier?.msg) return premier.msg.replace(/^Value error,\s*/, "");
    }
  }
  if (statut === 403) return "Vous n'avez pas les droits pour cette action.";
  if (statut === 404) return "Élément introuvable.";
  if (statut >= 500) return "Le serveur a rencontré un problème. Réessayez.";
  return "La requête a échoué.";
}

async function requete<T>(methode: Methode, chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(urlApi(chemin), {
      method: methode,
      headers: {
        ...(corps === undefined ? {} : { "Content-Type": "application/json" }),
        ...(jetonCourant ? { Authorization: `Bearer ${jetonCourant}` } : {}),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    // fetch ne rejette que sur une panne réseau, jamais sur un code HTTP.
    throw new ErreurApi(
      "Connexion impossible. Vérifiez votre réseau.",
      0,
    );
  }

  if (reponse.status === 204) return undefined as T;

  const texte = await reponse.text();
  let donnees: unknown = undefined;
  if (texte) {
    try {
      donnees = JSON.parse(texte);
    } catch {
      donnees = texte;
    }
  }

  if (!reponse.ok) {
    const erreur = new ErreurApi(messageErreur(donnees, reponse.status), reponse.status, donnees);
    if (erreur.sessionPerdue) surSessionPerdue?.();
    throw erreur;
  }
  return donnees as T;
}

export const api = {
  get: <T>(chemin: string) => requete<T>("GET", chemin),
  post: <T>(chemin: string, corps?: unknown) => requete<T>("POST", chemin, corps ?? {}),
  patch: <T>(chemin: string, corps: unknown) => requete<T>("PATCH", chemin, corps),
  delete: <T>(chemin: string) => requete<T>("DELETE", chemin),
};

/** Identifiant d'opération unique, pour rendre une écriture idempotente. */
export function nouvelOpId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
