/** Photographie optionnelle, avec repli si le fichier est absent.
 *
 * Les images vivent dans `public/images/` et ne sont pas versionnées avec le
 * code : une installation peut n'en avoir aucune. Le composant n'affiche donc
 * rien tant que le fichier n'a pas chargé, et laisse le dégradé de repli
 * occuper l'emplacement — la page reste correcte dans les deux cas.
 */

import { useState } from "react";

export function Illustration({
  nom, alt, className, style, position = "center",
}: {
  nom: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** Partie de la photo à conserver au recadrage. */
  position?: string;
}) {
  const [absente, setAbsente] = useState(false);
  if (absente) return null;

  return (
    <img
      src={`images/${nom}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setAbsente(true)}
      style={{
        width: "100%", height: "100%",
        objectFit: "cover", objectPosition: position,
        display: "block",
        ...style,
      }}
    />
  );
}
