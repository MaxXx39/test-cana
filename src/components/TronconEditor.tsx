import type { Couche, OptionsMateriau, Regard, Troncon, Tuyau } from '../calc/types';
import { nouveauTuyau, nouvelleCouche } from '../calc/projet';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
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

export function TronconEditor({ troncon: t, amont, aval, onChange, selection, onSelect }: Props) {
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

  /** Place les tuyaux côte à côte (enrobages jointifs), le groupe étant centré ; élargit la tranchée si besoin */
  const repartir = (tuyaux: Tuyau[]) => {
    const largeurs = tuyaux.map((p) => p.enrobage.gauche + p.diametre + p.enrobage.droite);
    const total = largeurs.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    const places = tuyaux.map((p, i) => {
      const position = x + p.enrobage.gauche + p.diametre / 2;
      x += largeurs[i];
      return { ...p, position: Math.round(position * 1000) / 1000 };
    });
    maj({ tuyaux: places, largeur: Math.max(t.largeur, Math.ceil(total * 100 - 1e-6) / 100) });
  };

  const ajouterTuyau = () => {
    const dernier = t.tuyaux[t.tuyaux.length - 1];
    const p = nouveauTuyau(`Tuyau ${t.tuyaux.length + 1}`);
    if (dernier) {
      p.diametre = dernier.diametre;
      p.paroi = dernier.paroi;
      p.enrobage = { ...dernier.enrobage };
      repartir([...t.tuyaux, p]);
    } else {
      maj({ tuyaux: [p] });
    }
    onSelect(p.id);
  };

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
          <NumberField label="Largeur en fond" value={t.largeur} onChange={(v) => maj({ largeur: v })} unite="m" min={0.1} pas={0.05} />
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
        <p className="aide">
          Profondeur de fouille : {fmt(amont.tn - amont.fe, 2)} m (TN − FE) en amont, {fmt(aval.tn - aval.fe, 2)} m en aval, plus le calage
          sous fil d’eau (paroi + enrobage bas).
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
          <h3>Tuyaux et enrobage</h3>
          <div className="actions">
            {t.tuyaux.length > 1 && (
              <button type="button" className="btn btn-leger" onClick={() => repartir(t.tuyaux)} title="Placer les tuyaux côte à côte, centrés (élargit la tranchée si nécessaire)">
                Répartir
              </button>
            )}
            <button type="button" className="btn btn-ajout" onClick={ajouterTuyau}>
              + Tuyau
            </button>
          </div>
        </div>
        {t.tuyaux.length === 0 && <p className="aide">Aucun tuyau : la fouille est entièrement remblayée.</p>}
        {t.tuyaux.map((p) => (
          <div
            key={p.id}
            className={`carte-tuyau ${p.id === selection ? 'carte-sel' : ''}`}
            onFocusCapture={() => onSelect(p.id)}
            onClick={() => onSelect(p.id)}
          >
            <div className="carte-entete">
              <input className="input-nom" value={p.nom} onChange={(e) => majTuyau(p.id, { nom: e.target.value })} aria-label="Nom du tuyau" />
              <button
                type="button"
                className="btn-icone"
                title="Supprimer ce tuyau"
                aria-label={`Supprimer ${p.nom}`}
                onClick={(e) => {
                  e.stopPropagation();
                  maj({ tuyaux: t.tuyaux.filter((q) => q.id !== p.id) });
                }}
              >
                ×
              </button>
            </div>
            <div className="grille-champs grille-serree">
              <NumberField label="Ø extérieur" value={p.diametre} onChange={(v) => majTuyau(p.id, { diametre: v })} echelle={1000} decimales={0} unite="mm" min={10} pas={10} />
              <NumberField label="Paroi" value={p.paroi} onChange={(v) => majTuyau(p.id, { paroi: v })} echelle={1000} decimales={0} unite="mm" min={0} pas={1} title="Écart entre fil d’eau et génératrice inférieure extérieure" />
              <NumberField label="Position / axe" value={p.position} onChange={(v) => majTuyau(p.id, { position: v })} unite="m" pas={0.05} title="Décalage de l’axe du tuyau par rapport à l’axe de la tranchée (négatif = à gauche)" />
            </div>
            <div className="enrobage-croix">
              <NumberField label="Haut" value={p.enrobage.haut} onChange={(v) => majEnrobage(p, 'haut', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
              <NumberField label="Gauche" value={p.enrobage.gauche} onChange={(v) => majEnrobage(p, 'gauche', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
              <span className="enrobage-centre" aria-hidden="true">
                Ø
              </span>
              <NumberField label="Droite" value={p.enrobage.droite} onChange={(v) => majEnrobage(p, 'droite', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
              <NumberField label="Bas (lit)" value={p.enrobage.bas} onChange={(v) => majEnrobage(p, 'bas', v)} echelle={100} decimales={0} unite="cm" min={0} pas={1} />
            </div>
          </div>
        ))}
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
