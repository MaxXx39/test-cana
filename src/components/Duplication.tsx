import { useState } from 'react';
import type { OptionsDuplication } from '../calc/projet';
import type { Projet } from '../calc/types';

interface Props {
  projet: Projet;
  /** Tronçon modèle */
  index: number;
  onDupliquer: (cibles: number[], options: OptionsDuplication) => void;
}

/** Recopie la tranchée du tronçon vers d'autres tronçons choisis */
export function Duplication({ projet, index, onDupliquer }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [cibles, setCibles] = useState<number[]>([]);
  const [tuyaux, setTuyaux] = useState(true);
  const autres = projet.troncons.map((_, i) => i).filter((i) => i !== index);

  if (!ouvert) {
    return (
      <button type="button" className="btn btn-leger btn-petit" onClick={() => setOuvert(true)} disabled={autres.length === 0}>
        Dupliquer vers…
      </button>
    );
  }

  const basculer = (i: number) => setCibles((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  const nom = (i: number) => `${i + 1}. ${projet.regards[i].nom} → ${projet.regards[i + 1].nom}`;

  return (
    <div className="duplication" role="group" aria-label={`Dupliquer la tranchée du tronçon ${index + 1}`}>
      <div className="duplication-titre">Dupliquer la tranchée du tronçon {index + 1} vers :</div>
      <div className="duplication-cibles">
        {autres.map((i) => (
          <label key={i} className="case">
            <input type="checkbox" checked={cibles.includes(i)} onChange={() => basculer(i)} />
            {nom(i)}
          </label>
        ))}
        <button type="button" className="lien" onClick={() => setCibles(cibles.length === autres.length ? [] : autres)}>
          {cibles.length === autres.length ? 'Aucun' : 'Tous'}
        </button>
      </div>
      <label className="case">
        <input type="checkbox" checked={tuyaux} onChange={(e) => setTuyaux(e.target.checked)} />
        Avec les tuyaux (réseaux, diamètres, écarts, enrobage)
      </label>
      <p className="aide">Tranchée, blindage, surface, décapage, structure et matériaux sont recopiés ; les longueurs sont conservées.</p>
      <div className="actions">
        <button type="button" className="btn btn-leger btn-petit" onClick={() => setOuvert(false)}>
          Fermer
        </button>
        <button
          type="button"
          className="btn btn-primaire btn-petit"
          disabled={cibles.length === 0}
          onClick={() => {
            onDupliquer(cibles, { tuyaux });
            setCibles([]);
            setOuvert(false);
          }}
        >
          Dupliquer{cibles.length ? ` (${cibles.length})` : ''}
        </button>
      </div>
    </div>
  );
}
