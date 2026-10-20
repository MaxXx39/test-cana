import type { Couche, ModeSaisie, OptionsMateriau, Regard, Reseau, Troncon, Tuyau } from '../calc/types';
import { changerEcart, ecartsTuyaux, nouvelleCouche, repartirTuyaux, tuyauxGaucheDroite } from '../calc/projet';
import { filDEauRegard } from '../calc/engine';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  reseaux: Reseau[];
  saisie: ModeSaisie;
  /** Premier tronçon du tracé (pas de tronçon précédent à suivre) */
  premier: boolean;
  onChange: (t: Troncon) => void;
  selection: string | null;
  onSelect: (id: string | null) => void;
}

const NOMS_COUCHES = [
  'Enrobé BB 0/10',
  'Béton bitumineux',
  'Grave-bitume',
  'Grave 0/31.5',
  'Grave non traitée 0/20',
  'Grave ciment',
  'Sable',
  'Terre végétale',
  'Béton',
];

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

const cm = (m: number) => fmt(m * 100, 0);

export function TronconEditor({ troncon: t, amont, aval, reseaux, saisie, premier, onChange, selection, onSelect }: Props) {
  const lie = !premier && t.commePrecedent;
  const maj = (partiel: Partial<Troncon>) => onChange({ ...t, ...partiel });
  const majTuyau = (id: string, partiel: Partial<Tuyau>) =>
    maj({ tuyaux: t.tuyaux.map((p) => (p.id === id ? { ...p, ...partiel } : p)) });
  const majCouche = (id: string, partiel: Partial<Couche>) =>
    maj({ couches: t.couches.map((c) => (c.id === id ? { ...c, ...partiel } : c)) });
  const deplacerCouche = (i: number, sens: -1 | 1) => {
    const couches = [...t.couches];
    const j = i + sens;
    if (j < 0 || j >= couches.length) return;
    [couches[i], couches[j]] = [couches[j], couches[i]];
    maj({ couches });
  };

  /** Place les tuyaux côte à côte, centrés ; élargit la tranchée si besoin */
  const repartir = (tuyaux: Tuyau[]) => {
    const r = repartirTuyaux(tuyauxGaucheDroite(tuyaux));
    maj({ tuyaux: r.tuyaux, largeur: t.largeurAuto ? r.largeur : Math.max(t.largeur, r.largeur) });
  };

  const tries = tuyauxGaucheDroite(t.tuyaux);
  const ecarts = ecartsTuyaux(tries);


  return (
    <div className="editeur">
      {!premier && (
        <label className={`case bandeau-lien ${lie ? 'bandeau-lien-actif' : ''}`}>
          <input type="checkbox" checked={lie} onChange={(e) => maj({ commePrecedent: e.target.checked })} />
          <span>
            Même tranchée que le tronçon précédent
            {lie && <small> — décochez pour la modifier (seuls les écarts entre tuyaux restent propres au tronçon)</small>}
          </span>
        </label>
      )}
      <section className="bloc-form">
        <div className="titre-actions">
          <h3>Écarts entre tuyaux</h3>
          {t.tuyaux.length > 1 && (
            <button type="button" className="btn btn-leger btn-petit" onClick={() => repartir(t.tuyaux)} title="Écarts ramenés à des enrobages jointifs, tuyaux centrés">
              Enrobages jointifs
            </button>
          )}
        </div>
        {t.tuyaux.length === 0 && <p className="aide">Aucun tuyau : cochez un réseau dans ce tronçon, colonne Tracé. La fouille est entièrement remblayée.</p>}
        <div className="liste-tuyaux">
          {tries.map((p, k) => {
            const res = reseaux.find((r) => r.id === p.reseau);
            const sel = p.id === selection;
            const feA = filDEauRegard(amont, p.reseau);
            const feB = filDEauRegard(aval, p.reseau);
            return (
              <div
                key={p.id}
                className={`carte-tuyau ${sel ? 'carte-sel' : ''}`}
                style={{ borderLeftColor: res?.couleur }}
                onClick={() => onSelect(p.id)}
                onFocusCapture={() => onSelect(p.id)}
              >
                <div className="tuyau-ligne">
                  <span className="tuyau-reseau" style={{ color: res?.couleur }}>
                    {res?.nom}
                  </span>
                  <NumberField value={p.diametre} onChange={(v) => majTuyau(p.id, { diametre: v })} echelle={1000} decimales={0} unite="mm" min={10} pas={10} title="Diamètre extérieur" />
                  {k === 0 ? (
                    <span className="tuyau-gauche">le plus à gauche</span>
                  ) : (
                    <NumberField
                      value={ecarts[k]}
                      onChange={(v) => onChange(changerEcart(t, p.id, v))}
                      unite="m"
                      pas={0.05}
                      className="col-ecart"
                      title={`Écart nu à nu (paroi à paroi) avec ${reseaux.find((r) => r.id === tries[k - 1].reseau)?.nom ?? 'le tuyau de gauche'}`}
                    />
                  )}
                  <span />
                </div>
                <div className="tuyau-resume">
                  {saisie === 'altitudes' && (
                    <>
                      FE {fmt(feA, 2)} → {fmt(feB, 2)} ·{' '}
                    </>
                  )}
                  prof. {fmt(amont.tn - feA, 2)} → {fmt(aval.tn - feB, 2)} m · enrobage du réseau : haut {cm(p.enrobage.haut)}, lit{' '}
                  {cm(p.enrobage.bas)}, côtés {cm(p.enrobage.gauche)}/{cm(p.enrobage.droite)} cm
                </div>
                {sel && (
                  <div className="tuyau-detail">
                    <div className="tuyau-pied">
                      <NumberField label="Paroi" value={p.paroi} onChange={(v) => majTuyau(p.id, { paroi: v })} echelle={1000} decimales={0} unite="mm" min={0} pas={1} title="Écart entre fil d’eau et génératrice inférieure extérieure" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {t.tuyaux.length > 0 && (
          <p className="aide">
            Tuyaux de gauche à droite. L’écart est la distance nu à nu (paroi à paroi) avec le tuyau de gauche, coté en orange sur la coupe.
            L’enrobage se règle par réseau, en haut du Tracé ; réseaux, diamètres et profondeurs se saisissent aussi dans le Tracé.
          </p>
        )}
      </section>

      <fieldset className="bloc-form" disabled={lie}>
        <div className="titre-actions">
          <h3>Structure (de la surface vers le bas)</h3>
          <button
            type="button"
            className="btn btn-ajout"
            onClick={() => maj({ couches: [...t.couches, nouvelleCouche('Grave 0/31.5', 0.2)] })}
          >
            + Couche
          </button>
        </div>
        {t.couches.map((c, i) => (
          <div key={c.id} className="ligne-couche">
            <span className={`pastille couche-${i % 6}`} aria-hidden="true" />
            <span className="nature-couche">
              <select
                className="select-nature"
                value={NOMS_COUCHES.includes(c.nom) ? c.nom : ''}
                onChange={(e) => majCouche(c.id, { nom: e.target.value })}
                aria-label="Nature de la couche"
              >
                {NOMS_COUCHES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="">Autre…</option>
              </select>
              {!NOMS_COUCHES.includes(c.nom) && (
                <input
                  className="input-nom"
                  value={c.nom}
                  placeholder="Nature de la couche"
                  onChange={(e) => majCouche(c.id, { nom: e.target.value })}
                  aria-label="Autre nature de couche"
                />
              )}
            </span>
            <NumberField value={c.epaisseur} onChange={(v) => majCouche(c.id, { epaisseur: v })} echelle={100} decimales={1} unite="cm" min={0} pas={1} />
            <button type="button" className="btn-icone" onClick={() => deplacerCouche(i, -1)} disabled={i === 0} title="Monter" aria-label="Monter la couche">
              ↑
            </button>
            <button type="button" className="btn-icone" onClick={() => deplacerCouche(i, 1)} disabled={i === t.couches.length - 1} title="Descendre" aria-label="Descendre la couche">
              ↓
            </button>
            <button type="button" className="btn-icone" onClick={() => maj({ couches: t.couches.filter((q) => q.id !== c.id) })} title="Supprimer" aria-label={`Supprimer ${c.nom}`}>
              ×
            </button>
          </div>
        ))}
        <div className="ligne-couche">
          <span className="pastille pastille-remblai" aria-hidden="true" />
          <input className="input-nom" value={t.remblaiNom} onChange={(e) => maj({ remblaiNom: e.target.value })} aria-label="Nom du remblai" />
          <span className="aide">hauteur variable, comble jusqu’à l’enrobage</span>
        </div>
      </fieldset>

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
