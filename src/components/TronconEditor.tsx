import type { Couche, ModeSaisie, OptionsMateriau, Regard, Reseau, Troncon, Tuyau } from '../calc/types';
import { changerEcart, ecartsTuyaux, nouvelleCouche, repartirTuyaux, tuyauxGaucheDroite } from '../calc/projet';
import { filDEauRegard, largeurFouille, profondeur } from '../calc/engine';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  reseaux: Reseau[];
  saisie: ModeSaisie;
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

export function TronconEditor({ troncon: t, amont, aval, reseaux, saisie, onChange, selection, onSelect }: Props) {
  const maj = (partiel: Partial<Troncon>) => onChange({ ...t, ...partiel });
  const majTuyau = (id: string, partiel: Partial<Tuyau>) =>
    maj({ tuyaux: t.tuyaux.map((p) => (p.id === id ? { ...p, ...partiel } : p)) });
  const majEnrobage = (p: Tuyau, cote: keyof Tuyau['enrobage'], v: number) => majTuyau(p.id, { enrobage: { ...p.enrobage, [cote]: v } });
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

  const enrobageATous = (e: Tuyau['enrobage']) => maj({ tuyaux: t.tuyaux.map((p) => ({ ...p, enrobage: { ...e } })) });

  return (
    <div className="editeur">
      <section className="bloc-form">
        <h3>Tranchée</h3>
        <div className="grille-champs">
          <NumberField label="Longueur" value={t.longueur} onChange={(v) => maj({ longueur: v })} unite="m" min={0} pas={1} />
          <div className="champ">
            <span className="champ-label">Type</span>
            <div className="segment" role="radiogroup" aria-label="Type de tranchée">
              <button type="button" role="radio" aria-checked={t.type === 'U'} className={t.type === 'U' ? 'actif' : ''} onClick={() => maj({ type: 'U' })}>
                En U · blindée
              </button>
              <button type="button" role="radio" aria-checked={t.type === 'V'} className={t.type === 'V' ? 'actif' : ''} onClick={() => maj({ type: 'V' })}>
                En V · talutée
              </button>
            </div>
          </div>
          <div className="champ">
            <NumberField
              label={t.type === 'U' ? 'Largeur utile en fond' : 'Largeur en fond'}
              value={t.largeur}
              onChange={(v) => maj({ largeur: v, largeurAuto: false })}
              unite="m"
              min={0.1}
              pas={0.05}
              title={t.type === 'U' ? 'Entre les blindages' : undefined}
            />
            <label className="case case-petite">
              <input type="checkbox" checked={t.largeurAuto} onChange={(e) => maj({ largeurAuto: e.target.checked })} />
              Auto (selon tuyaux et écarts)
            </label>
          </div>
          {t.type === 'U' && (
            <NumberField
              label="Blindage (par côté)"
              value={t.blindage}
              onChange={(v) => maj({ blindage: v })}
              echelle={100}
              decimales={1}
              unite="cm"
              min={0}
              pas={1}
              title="Épaisseur du blindage de chaque côté : elle s’ajoute à la largeur de fouille"
            />
          )}
          {t.type === 'V' && (
            <NumberField
              label="Pente de talus (H/V)"
              value={t.fruit}
              onChange={(v) => maj({ fruit: v })}
              min={0}
              pas={0.05}
              title="Fruit : élargissement horizontal par mètre de profondeur, de chaque côté"
            />
          )}
        </div>
        {t.type === 'U' && t.blindage > 0 && (
          <p className="aide">
            Largeur de fouille : {fmt(largeurFouille(t), 2)} m ({fmt(t.largeur, 2)} m utile + 2 × {fmt(t.blindage * 100, 1)} cm de blindage).
          </p>
        )}
        <p className="aide">
          Profondeur de fouille : {fmt(profondeur(t, amont, aval, 0), 2)} m en amont, {fmt(profondeur(t, amont, aval, 1), 2)} m en aval. Le fond
          est calé sous le réseau le plus profond (fil d’eau − paroi − enrobage bas).
        </p>
      </section>

      <section className="bloc-form">
        <h3>Surface et décapage</h3>
        <div className="grille-champs">
          <div className="champ">
            <span className="champ-label">Nature du dessus</span>
            <div className="segment" role="radiogroup" aria-label="Nature du dessus">
              <button type="button" role="radio" aria-checked={t.surface === 'terre'} className={t.surface === 'terre' ? 'actif' : ''} onClick={() => maj({ surface: 'terre' })}>
                Terre
              </button>
              <button type="button" role="radio" aria-checked={t.surface === 'enrobe'} className={t.surface === 'enrobe' ? 'actif' : ''} onClick={() => maj({ surface: 'enrobe' })}>
                Enrobé
              </button>
            </div>
          </div>
          <label className="case champ-case">
            <input type="checkbox" checked={t.decapage.actif} onChange={(e) => maj({ decapage: { ...t.decapage, actif: e.target.checked } })} />
            Décapage
          </label>
          {t.decapage.actif && (
            <NumberField
              label="Épaisseur de décapage"
              value={t.decapage.epaisseur}
              onChange={(v) => maj({ decapage: { ...t.decapage, epaisseur: v } })}
              echelle={100}
              decimales={1}
              unite="cm"
              min={0}
              pas={1}
            />
          )}
        </div>
      </section>

      <section className="bloc-form">
        <div className="titre-actions">
          <h3>Position et enrobage des tuyaux</h3>
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
                  prof. {fmt(amont.tn - feA, 2)} → {fmt(aval.tn - feB, 2)} m
                  {!sel && (
                    <>
                      {' '}
                      · enrobage {cm(p.enrobage.bas)}/{cm(p.enrobage.gauche)}/{cm(p.enrobage.droite)}/{cm(p.enrobage.haut)} cm
                    </>
                  )}
                </div>
                {sel && (
                  <div className="tuyau-detail">
                    <div className="enrobage-croix">
                      <NumberField label="Haut" value={p.enrobage.haut} onChange={(v) => majEnrobage(p, 'haut', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
                      <NumberField label="Gauche" value={p.enrobage.gauche} onChange={(v) => majEnrobage(p, 'gauche', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
                      <span className="enrobage-centre" style={{ borderColor: res?.couleur, color: res?.couleur }} aria-hidden="true">
                        {res?.nom}
                      </span>
                      <NumberField label="Droite" value={p.enrobage.droite} onChange={(v) => majEnrobage(p, 'droite', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
                      <NumberField label="Bas (lit)" value={p.enrobage.bas} onChange={(v) => majEnrobage(p, 'bas', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
                    </div>
                    <div className="tuyau-pied">
                      <NumberField label="Paroi" value={p.paroi} onChange={(v) => majTuyau(p.id, { paroi: v })} echelle={1000} decimales={0} unite="mm" min={0} pas={1} title="Écart entre fil d’eau et génératrice inférieure extérieure" />
                      {t.tuyaux.length > 1 && (
                        <button type="button" className="btn btn-leger btn-petit" onClick={() => enrobageATous(p.enrobage)}>
                          Même enrobage pour tous
                        </button>
                      )}
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
            Cliquez un tuyau pour régler son enrobage ; réseaux, diamètres et profondeurs se saisissent dans le Tracé.
          </p>
        )}
      </section>

      <section className="bloc-form">
        <div className="titre-actions">
          <h3>Structure (de la surface vers le bas)</h3>
          <button
            type="button"
            className="btn btn-ajout"
            onClick={() => maj({ couches: [...t.couches, nouvelleCouche(`Couche ${t.couches.length + 1}`, 0.2)] })}
          >
            + Couche
          </button>
        </div>
        <datalist id="noms-couches">
          {NOMS_COUCHES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {t.couches.map((c, i) => (
          <div key={c.id} className="ligne-couche">
            <span className={`pastille couche-${i % 6}`} aria-hidden="true" />
            <input className="input-nom" list="noms-couches" value={c.nom} onChange={(e) => majCouche(c.id, { nom: e.target.value })} aria-label="Nom de la couche" />
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
      </section>

      <section className="bloc-form">
        <h3>Matériaux extraits</h3>
        <OptionsExtrait titre="Déblai" options={t.optionsDeblai} onChange={(o) => maj({ optionsDeblai: o })} />
        {t.decapage.actif && (
          <OptionsExtrait
            titre={t.surface === 'enrobe' ? 'Décapage enrobé' : 'Décapage terre'}
            options={t.optionsDecapage}
            onChange={(o) => maj({ optionsDecapage: o })}
          />
        )}
      </section>
    </div>
  );
}
