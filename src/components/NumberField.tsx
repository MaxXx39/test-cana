import { useEffect, useRef, useState } from 'react';
import { fmt, lireNombre } from '../utils/format';

interface Props {
  /** Valeur interne (en mètres pour les longueurs) */
  value: number;
  onChange: (v: number) => void;
  /** Facteur d'affichage : 100 pour des cm, 1000 pour des mm */
  echelle?: number;
  decimales?: number;
  unite?: string;
  min?: number;
  max?: number;
  /** Pas des flèches haut/bas, en unité affichée */
  pas?: number;
  label?: string;
  title?: string;
  id?: string;
  /** Classe ajoutée au champ (ex. teinte de colonne) */
  className?: string;
}

/** Champ numérique acceptant la virgule, qui ne reformate pas pendant la saisie */
export function NumberField({ value, onChange, echelle = 1, decimales = 2, unite, min, max, pas, label, title, id, className }: Props) {
  const affiche = value * echelle;
  const [texte, setTexte] = useState(() => fmt(affiche, decimales).replace(/\s/g, ''));
  const focus = useRef(false);

  useEffect(() => {
    if (!focus.current) setTexte(fmt(affiche, decimales).replace(/\s/g, ''));
  }, [affiche, decimales]);

  const borner = (v: number) => {
    let r = v;
    if (min !== undefined) r = Math.max(min, r);
    if (max !== undefined) r = Math.min(max, r);
    return r;
  };

  const valider = (t: string) => {
    const n = lireNombre(t);
    if (n !== null) onChange(borner(n) / echelle);
  };

  const input = (
    <span className={className ? `nf ${className}` : 'nf'}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={texte}
        title={title}
        onFocus={(e) => {
          focus.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focus.current = false;
          setTexte(fmt(affiche, decimales).replace(/\s/g, ''));
        }}
        onChange={(e) => {
          setTexte(e.target.value);
          valider(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (pas ?? Math.pow(10, -decimales)) * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const n = borner(Number((affiche + delta).toFixed(6)));
            setTexte(fmt(n, decimales).replace(/\s/g, ''));
            onChange(n / echelle);
          } else if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
      {unite && <span className="nf-unite">{unite}</span>}
    </span>
  );

  if (!label) return input;
  return (
    <label className="champ">
      <span className="champ-label">{label}</span>
      {input}
    </label>
  );
}
