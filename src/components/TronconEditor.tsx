import type { OptionsMateriau, Troncon } from '../calc/types';
import { NumberField } from './NumberField';

interface Props {
  troncon: Troncon;
  /** Premier tronçon du tracé (pas de tronçon précédent à suivre) */
  premier: boolean;
  onChange: (t: Troncon) => void;
}

function OptionsExtrait({ titre, options, onChange }: { titre: string; options: OptionsMateriau; onChange: (o: OptionsMateriau) => void }) {
  return (
    <div className="ligne-options">
      <span className="ligne-options-titre">{titre}</span>
      <label className="case">
        <input type="checkbox" checked={options.reutilise} onChange={(e) => onChange({ ...options, reutilise: e.target.checked })} />
        Réutilisé en remblai
      </label>
      <label className="case">
        <input type="checkbox" checked={options.foisonnement} onChange={(e) => onChange({ ...options, foisonnement: e.target.checked })} />
        Foisonnement
      </label>
      {options.foisonnement && (
        <NumberField
          value={options.coefficient}
          onChange={(v) => onChange({ ...options, coefficient: v })}
          decimales={2}
          min={1}
          max={3}
          pas={0.05}
          unite="×"
          title="Coefficient de foisonnement"
        />
      )}
    </div>
  );
}

/**
 * Réglages du tronçon qui ne se lisent pas sur la coupe : lien avec le tronçon précédent
 * et destination des matériaux extraits. Tout le reste se saisit sur la coupe.
 */
export function TronconEditor({ troncon: t, premier, onChange }: Props) {
  const lie = !premier && t.commePrecedent;
  const maj = (partiel: Partial<Troncon>) => onChange({ ...t, ...partiel });

  return (
    <div className="editeur">
      {!premier && (
        <label className={`case bandeau-lien ${lie ? 'bandeau-lien-actif' : ''}`}>
          <input type="checkbox" checked={lie} onChange={(e) => maj({ commePrecedent: e.target.checked })} />
          <span>
            Même tranchée que le tronçon précédent
            {lie && <small> — décochez pour la modifier (seuls les réseaux posés et les écarts restent propres au tronçon)</small>}
          </span>
        </label>
      )}
      <fieldset className="bloc-form" disabled={lie}>
        <h3>Matériaux extraits</h3>
        <OptionsExtrait titre="Déblai" options={t.optionsDeblai} onChange={(o) => maj({ optionsDeblai: o })} />
        {t.decapage.actif && (
          <OptionsExtrait
            titre={t.surface === 'enrobe' ? 'Décapage enrobé' : 'Décapage terre'}
            options={t.optionsDecapage}
            onChange={(o) => maj({ optionsDecapage: o })}
          />
        )}
      </fieldset>
    </div>
  );
}
