"""Primitives de sécurité : hachage des secrets, jetons, anti-force-brute.

Règles non négociables :
  * aucun secret n'est stocké en clair (PBKDF2-HMAC-SHA256) ;
  * une comparaison de secret passe toujours par `hmac.compare_digest` ;
  * un identifiant inconnu consomme le même temps de calcul qu'un mauvais mot
    de passe, sinon la durée de réponse révèle quels comptes existent ;
  * le verrou anti-force-brute porte sur l'identifiant tenté, jamais sur l'IP
    (derrière un ingress toutes les requêtes la partagent, et l'en-tête
    X-Forwarded-For est falsifiable).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

# 210 000 itérations : le hachage tourne côté serveur (Python), pas sur un
# téléphone d'entrée de gamme. Aligné sur la recommandation OWASP 2023.
ITERATIONS = 210_000
LONGUEUR_SEL = 16
LONGUEUR_CLE = 32


def hacher_secret(secret: str, *, iterations: int = ITERATIONS) -> str:
    """Retourne `pbkdf2_sha256$<iterations>$<sel_b64>$<cle_b64>`."""
    if not secret:
        raise ValueError("Le secret ne peut pas être vide.")
    sel = secrets.token_bytes(LONGUEUR_SEL)
    cle = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), sel, iterations, LONGUEUR_CLE)
    return "$".join(
        [
            "pbkdf2_sha256",
            str(iterations),
            base64.b64encode(sel).decode("ascii"),
            base64.b64encode(cle).decode("ascii"),
        ]
    )


def verifier_secret(secret: str, empreinte: str) -> bool:
    """Vérifie un secret contre son empreinte, en temps constant."""
    try:
        algo, brut_iter, sel_b64, cle_b64 = empreinte.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(brut_iter)
        sel = base64.b64decode(sel_b64)
        attendu = base64.b64decode(cle_b64)
    except (ValueError, TypeError):
        return False
    calcule = hashlib.pbkdf2_hmac(
        "sha256", secret.encode("utf-8"), sel, iterations, len(attendu)
    )
    return hmac.compare_digest(calcule, attendu)


# Empreinte factice : sert à brûler le même temps de calcul quand le compte
# n'existe pas, pour que la durée de réponse ne trahisse pas son absence.
_EMPREINTE_FACTICE = hacher_secret("empreinte-factice-non-utilisable")


def bruler_temps_secret() -> None:
    """Consomme le temps d'un PBKDF2 sans rien vérifier."""
    verifier_secret("mot-de-passe-invalide", _EMPREINTE_FACTICE)


# ---------------------------------------------------------------------------
# Verrou anti-force-brute
# ---------------------------------------------------------------------------


@dataclass
class _Tentatives:
    echecs: int = 0
    bloque_jusqua: float = 0.0


@dataclass
class VerrouConnexion:
    """Compteur d'échecs en mémoire, par identifiant tenté.

    En mémoire, donc remis à zéro au redémarrage et non partagé entre
    plusieurs instances. C'est un compromis assumé pour un déploiement mono-
    instance ; passer sur Redis si l'application est répliquée.
    """

    max_echecs: int = 5
    duree_blocage: int = 900
    _etat: dict[str, _Tentatives] = field(default_factory=dict)

    @staticmethod
    def _cle(identifiant: str) -> str:
        return identifiant.strip().lower()

    def verifier(self, identifiant: str) -> int:
        """Retourne 0 si autorisé, sinon le nombre de secondes à attendre."""
        etat = self._etat.get(self._cle(identifiant))
        if etat is None:
            return 0
        restant = etat.bloque_jusqua - time.monotonic()
        return max(0, int(restant)) if restant > 0 else 0

    def noter_echec(self, identifiant: str) -> None:
        cle = self._cle(identifiant)
        etat = self._etat.setdefault(cle, _Tentatives())
        etat.echecs += 1
        if etat.echecs >= self.max_echecs:
            etat.bloque_jusqua = time.monotonic() + self.duree_blocage
            etat.echecs = 0

    def noter_succes(self, identifiant: str) -> None:
        self._etat.pop(self._cle(identifiant), None)


# ---------------------------------------------------------------------------
# Jetons JWT
# ---------------------------------------------------------------------------


def creer_jeton(charge: dict[str, Any], secret: str, *, duree: timedelta) -> str:
    maintenant = datetime.now(timezone.utc)
    corps = dict(charge)
    corps["iat"] = int(maintenant.timestamp())
    corps["exp"] = int((maintenant + duree).timestamp())
    return jwt.encode(corps, secret, algorithm="HS256")


class JetonInvalide(Exception):
    """Jeton absent, expiré, mal signé ou de type inattendu."""


def lire_jeton(jeton: str, secret: str) -> dict[str, Any]:
    try:
        # `algorithms` est explicite : accepter l'algorithme annoncé par le
        # jeton permettrait l'attaque « alg: none ».
        return jwt.decode(jeton, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise JetonInvalide("Jeton expiré.") from exc
    except jwt.InvalidTokenError as exc:
        raise JetonInvalide("Jeton invalide.") from exc


def jeton_opaque(longueur: int = 32) -> str:
    """Jeton aléatoire pour les liens de portail élève."""
    return secrets.token_urlsafe(longueur)
