import type { Projet, Regard } from '../calc/types';
import type { ResultatTroncon } from '../calc/engine';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  projet: Projet;
  resultats: ResultatTroncon[];
  actif: number;
  onSelect: (index: number) => void;
  onRegard: (index: number, r: Regard) => void;
  onLongueur: (index: number, longueur: number) => void;
  onInserer: (index: number) => void;
  onSupprimer: (index: number) => void;
}

/** Saisie du tracé : regards dans l'ordre, tronçons intercalés */
export function Trace({ projet, resultats, actif, onSelect, onRegard, onLongueur, onInserer, onSupprimer }: Props) {
  return (
    <div className="trace">
      <div className="trace-entete">
        <span>Regard</span>
        <span>TN</span>
        <span>FE</span>
        <span className="num">Prof.</span>
        <span />
      </div>
      {projet.regards.map((r, i) => {
        const t = projet.troncons[i];
        const res = resultats[i];
        return (
          <div key={r.id}>
            <div className="regard-ligne">
              <input className="input-nom" value={r.nom} onChange={(e) => onRegard(i, { ...r, nom: e.target.value })} aria-label="Nom du regard" />
              <NumberField value={r.tn} onChange={(v) => onRegard(i, { ...r, tn: v })} decimales={2} pas={0.01} title="Altitude du terrain naturel (m)" />
              <NumberField value={r.fe} onChange={(v) => onRegard(i, { ...r, fe: v })} decimales={2} pas={0.01} title="Altitude du fil d’eau projet (m)" />
              <span className={`num prof ${r.tn - r.fe <= 0 ? 'alerte-texte' : ''}`}>{fmt(r.tn - r.fe, 2)}</span>
              <button
                type="button"
                className="btn-icone"
                disabled={projet.regards.length <= 2}
                onClick={() => onSupprimer(i)}
                title="Supprimer ce regard"
                aria-label={`Supprimer le regard ${r.nom}`}
              >
                ×
              </button>
            </div>
            {t && (
              <div className={`troncon-ligne ${i === actif ? 'troncon-actif' : ''}`}>
                <button type="button" className="troncon-select" onClick={() => onSelect(i)} aria-pressed={i === actif}>
                  <span className="troncon-titre">
                    Tronçon {i + 1} · {t.type === 'U' ? 'U' : 'V'} {fmt(t.largeur, 2)} m
                  </span>
                  <span className="troncon-sous">
                    {res ? `${fmt(res.fouille, 1)} m³ de fouille` : ''}
                    {res && res.alertes.length > 0 && <span className="badge-alerte"> · ⚠ {res.alertes.length}</span>}
                  </span>
                </button>
                <NumberField value={t.longueur} onChange={(v) => onLongueur(i, v)} decimales={2} unite="m" min={0} pas={1} title="Longueur du tronçon" />
                <button type="button" className="btn-icone" onClick={() => onInserer(i + 1)} title="Insérer un regard dans ce tronçon" aria-label="Insérer un regard">
                  +
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn-ajout btn-plein" onClick={() => onInserer(projet.regards.length)}>
        + Regard en fin de tracé
      </button>
    </div>
  );
}
