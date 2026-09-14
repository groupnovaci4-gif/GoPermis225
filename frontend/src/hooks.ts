/** Petits crochets partagés : chargement de données, état de formulaire. */

import { useCallback, useEffect, useState } from "react";

import { ErreurApi } from "./api";

interface EtatChargement<T> {
  donnees: T | null;
  chargement: boolean;
  erreur: string | null;
  recharger: () => void;
}

/**
 * Charge une ressource et suit son état.
 *
 * `cles` joue le rôle du tableau de dépendances : le rechargement se
 * déclenche quand l'une d'elles change (un filtre, un identifiant d'URL).
 */
export function useChargement<T>(
  charger: () => Promise<T>,
  cles: unknown[] = [],
): EtatChargement<T> {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const recharger = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);

    charger()
      .then((resultat) => {
        // Le composant a pu être démonté, ou une requête plus récente être
        // partie : on ignore alors le résultat au lieu d'écraser l'affichage.
        if (!annule) setDonnees(resultat);
      })
      .catch((e: unknown) => {
        if (annule) return;
        setErreur(e instanceof ErreurApi ? e.message : "Une erreur est survenue.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
    // `charger` est volontairement hors dépendances : la plupart des appels
    // passent une lambda recréée à chaque rendu, ce qui boucterait à l'infini.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...cles, tick]);

  return { donnees, chargement, erreur, recharger };
}

/** État d'un formulaire : envoi en cours, erreur, succès. */
export function useEnvoi() {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const executer = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setEnvoi(true);
    setErreur(null);
    try {
      await action();
      return true;
    } catch (e: unknown) {
      setErreur(e instanceof ErreurApi ? e.message : "Une erreur est survenue.");
      return false;
    } finally {
      setEnvoi(false);
    }
  }, []);

  return { envoi, erreur, setErreur, executer };
}
