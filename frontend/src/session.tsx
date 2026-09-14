/** Session courante : jeton, utilisateur, rôle. Persistée dans le navigateur. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, definirJeton, surPerteDeSession } from "./api";
import type { Cote, Ecole, Role, Utilisateur } from "./types";

const CLE_STOCKAGE = "gopermis.session";

interface EtatSession {
  jeton: string;
  cote: Cote;
  utilisateur?: Utilisateur;
  ecole?: { id: string; nom: string };
}

interface ContexteSession {
  session: EtatSession | null;
  pret: boolean;
  role: Role | null;
  estDirecteur: boolean;
  estMoniteur: boolean;
  peutGerer: boolean;
  connecter: (telephone: string, motDePasse: string) => Promise<void>;
  inscrire: (donnees: InscriptionEcole) => Promise<void>;
  connecterPortail: (jetonLien: string) => Promise<void>;
  deconnecter: () => void;
}

export interface InscriptionEcole {
  nomEcole: string;
  commune: string;
  nomDirecteur: string;
  telephone: string;
  motDePasse: string;
}

const Contexte = createContext<ContexteSession | null>(null);

function lireStockage(): EtatSession | null {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    return brut ? (JSON.parse(brut) as EtatSession) : null;
  } catch {
    // Navigation privée, stockage bloqué : on démarre déconnecté plutôt que
    // de planter l'application au premier rendu.
    return null;
  }
}

function ecrireStockage(etat: EtatSession | null): void {
  try {
    if (etat) localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat));
    else localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* stockage indisponible : la session vivra le temps de l'onglet */
  }
}

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<EtatSession | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    const sauvegardee = lireStockage();
    if (sauvegardee) {
      definirJeton(sauvegardee.jeton);
      setSession(sauvegardee);
    }
    setPret(true);
  }, []);

  const deconnecter = useCallback(() => {
    definirJeton(null);
    ecrireStockage(null);
    setSession(null);
  }, []);

  useEffect(() => {
    // Un 401 signifie que le jeton ne vaut plus rien : on nettoie tout de
    // suite plutôt que de laisser l'interface enchaîner les erreurs.
    surPerteDeSession(deconnecter);
  }, [deconnecter]);

  const installer = useCallback((etat: EtatSession) => {
    definirJeton(etat.jeton);
    ecrireStockage(etat);
    setSession(etat);
  }, []);

  const connecter = useCallback(
    async (telephone: string, motDePasse: string) => {
      const reponse = await api.post<{
        jeton: string; utilisateur: Utilisateur; ecole: { id: string; nom: string } | null;
      }>("/api/auth/connexion", { telephone, motDePasse });
      installer({
        jeton: reponse.jeton,
        cote: "ecole",
        utilisateur: reponse.utilisateur,
        ecole: reponse.ecole ?? undefined,
      });
    },
    [installer],
  );

  const inscrire = useCallback(
    async (donnees: InscriptionEcole) => {
      const reponse = await api.post<{
        jeton: string; utilisateur: Utilisateur; ecole: { id: string; nom: string };
      }>("/api/auth/inscription", donnees);
      installer({
        jeton: reponse.jeton,
        cote: "ecole",
        utilisateur: reponse.utilisateur,
        ecole: reponse.ecole,
      });
    },
    [installer],
  );

  const connecterPortail = useCallback(
    async (jetonLien: string) => {
      const reponse = await api.post<{ jeton: string }>("/api/auth/portail", { jeton: jetonLien });
      installer({ jeton: reponse.jeton, cote: "eleve" });
    },
    [installer],
  );

  const valeur = useMemo<ContexteSession>(() => {
    const role = session?.utilisateur?.role ?? null;
    return {
      session,
      pret,
      role,
      estDirecteur: role === "directeur",
      estMoniteur: role === "moniteur",
      peutGerer: role === "directeur" || role === "secretaire",
      connecter,
      inscrire,
      connecterPortail,
      deconnecter,
    };
  }, [session, pret, connecter, inscrire, connecterPortail, deconnecter]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): ContexteSession {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error("useSession doit être utilisé dans <FournisseurSession>.");
  return contexte;
}

export type { Ecole };
