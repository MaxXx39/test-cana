import { classeMateriau } from '../calc/projet';
import type { Canalisation, ResultatGlobal, ResultatTroncon, VolumeExtrait } from '../calc/engine';
import { fmt } from '../utils/format';

const m3 = (v: number) => `${fmt(v, 2)} m³`;

function destination(e: VolumeExtrait, coef: boolean) {
  return (
    <span className={`dest ${e.reutilise ? 'dest-reemploi' : 'dest-evac'}`}>
      {e.reutilise ? 'Réemploi' : 'Évacuation'}
      {coef && e.compte !== e.enPlace ? ` · ${fmt(e.compte, 2)} m³ foisonné` : ''}
    </span>
  );
}

function LignesCanalisations({ c, colonnes }: { c: Canalisation[]; colonnes: 2 | 3 }) {
  return (
    <>
      <tr className="groupe">
        <th colSpan={colonnes}>Canalisations</th>
      </tr>
      {c.map((x) => (
        <tr key={`${x.reseau}-${x.diametre}`}>
          <td>
            <span className="pastille-reseau" style={{ background: x.couleur }} aria-hidden="true" /> {x.nom} Ø{fmt(x.diametre * 1000, 0)}
          </td>
          <td className="num">{fmt(x.longueur, 2)} m</td>
          {colonnes === 3 && <td />}
        </tr>
      ))}
    </>
  );
}

export function DetailTroncon({ r }: { r: ResultatTroncon }) {
  const structure = r.couches.reduce((s, c) => s + c.volume, 0);
  return (
    <div className="detail">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-val">{fmt(r.fouille, 2)}</span>
          <span className="kpi-lib">m³ de fouille</span>
        </div>
        <div className="kpi">
          <span className="kpi-val">{fmt(r.evacuation, 2)}</span>
          <span className="kpi-lib">m³ évacués</span>
        </div>
        <div className="kpi">
          <span className="kpi-val">{fmt(r.reemploi, 2)}</span>
          <span className="kpi-lib">m³ réemployés</span>
        </div>
        <div className="kpi">
          <span className="kpi-val">{fmt(r.apport, 2)}</span>
          <span className="kpi-lib">m³ de remblai d’apport</span>
        </div>
      </div>
      <table className="table-detail">
        <tbody>
          {r.canalisations.length > 0 && <LignesCanalisations c={r.canalisations} colonnes={3} />}
          <tr className="groupe">
            <th colSpan={3}>Extraction</th>
          </tr>
          {r.decapage > 0 && (
            <tr>
              <td>Décapage {r.surface === 'enrobe' ? 'enrobé' : 'terre'}</td>
              <td className="num">{m3(r.decapage)}</td>
              <td>{destination(r.extraitDecapage, true)}</td>
            </tr>
          )}
          <tr>
            <td>Déblai{r.decapage > 0 ? ' (hors décapage)' : ''}</td>
            <td className="num">{m3(r.deblai)}</td>
            <td>{destination(r.extraitDeblai, true)}</td>
          </tr>
          <tr className="groupe">
            <th colSpan={3}>Mise en œuvre</th>
          </tr>
          {r.enrobages.map((e, i) => (
            <tr key={`enr-${i}`}>
              <td>
                <span className={`pastille enr-${classeMateriau(e.nom)}`} aria-hidden="true" /> Enrobage {e.nom.toLowerCase()}
              </td>
              <td className="num">{m3(e.volume)}</td>
              <td className="aide">{i === 0 ? `net des tuyaux (${m3(r.tuyaux)})` : ''}</td>
            </tr>
          ))}
          {r.couches.map((c, i) => (
            <tr key={i}>
              <td>
                <span className={`pastille couche-${i % 6}`} aria-hidden="true" /> {c.nom}
              </td>
              <td className="num">{m3(c.volume)}</td>
              <td />
            </tr>
          ))}
          {r.couches.length > 1 && (
            <tr className="sous-total">
              <td>Structure</td>
              <td className="num">{m3(structure)}</td>
              <td />
            </tr>
          )}
          <tr>
            <td>Remblai</td>
            <td className="num">{m3(r.remblai)}</td>
            <td className="aide">dont apport : {m3(r.apport)}</td>
          </tr>
          <tr className="groupe">
            <th colSpan={3}>Surfaces</th>
          </tr>
          <tr>
            <td>Emprise en tête</td>
            <td className="num">{fmt(r.surfaceTete, 2)} m²</td>
            <td />
          </tr>
          {r.type === 'U' && (
            <tr>
              <td>Blindage (2 faces)</td>
              <td className="num">{fmt(r.surfaceBlindage, 2)} m²</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      {r.alertes.length > 0 && (
        <ul className="alertes">
          {r.alertes.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TableauTroncons({
  resultats,
  global,
  actif,
  onSelect,
}: {
  resultats: ResultatTroncon[];
  global: ResultatGlobal;
  actif: number;
  onSelect: (i: number) => void;
}) {
  const structure = (r: ResultatTroncon) => r.couches.reduce((s, c) => s + c.volume, 0);
  const totalStructure = global.couches.reduce((s, c) => s + c.volume, 0);
  return (
    <div className="table-scroll">
      <table className="table-troncons">
        <thead>
          <tr>
            <th>Tronçon</th>
            <th className="num">L (m)</th>
            <th className="num">H amont</th>
            <th className="num">H aval</th>
            <th className="num">Fouille</th>
            <th className="num">Décapage</th>
            <th className="num">Déblai</th>
            <th className="num">Enrobage</th>
            <th className="num">Structure</th>
            <th className="num">Remblai</th>
            <th className="num">Réemploi</th>
            <th className="num">Évacuation</th>
            <th className="num">Apport</th>
          </tr>
        </thead>
        <tbody>
          {resultats.map((r) => (
            <tr key={r.index} className={r.index === actif ? 'ligne-active' : ''} onClick={() => onSelect(r.index)}>
              <td>
                <button type="button" className="lien" onClick={() => onSelect(r.index)}>
                  {r.index + 1}. {r.amont} → {r.aval}
                </button>
                {r.alertes.length > 0 && <span className="badge-alerte" title={r.alertes.join('\n')}> ⚠</span>}
              </td>
              <td className="num">{fmt(r.longueur, 2)}</td>
              <td className="num">{fmt(r.H1, 2)}</td>
              <td className="num">{fmt(r.H2, 2)}</td>
              <td className="num">{fmt(r.fouille, 2)}</td>
              <td className="num">{fmt(r.decapage, 2)}</td>
              <td className="num">{fmt(r.deblai, 2)}</td>
              <td className="num">{fmt(r.enrobage, 2)}</td>
              <td className="num">{fmt(structure(r), 2)}</td>
              <td className="num">{fmt(r.remblai, 2)}</td>
              <td className="num">{fmt(r.reemploi, 2)}</td>
              <td className="num">{fmt(r.evacuation, 2)}</td>
              <td className="num">{fmt(r.apport, 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{fmt(global.longueur, 2)}</td>
            <td />
            <td />
            <td className="num">{fmt(global.fouille, 2)}</td>
            <td className="num">{fmt(global.decapageTerre + global.decapageEnrobe, 2)}</td>
            <td className="num">{fmt(global.deblai, 2)}</td>
            <td className="num">{fmt(global.enrobage, 2)}</td>
            <td className="num">{fmt(totalStructure, 2)}</td>
            <td className="num">{fmt(global.remblai, 2)}</td>
            <td className="num">{fmt(global.reemploi, 2)}</td>
            <td className="num">{fmt(global.evacuation, 2)}</td>
            <td className="num" title="À l’échelle du chantier : les excédents de réemploi d’un tronçon compensent les autres">
              {fmt(global.apport, 2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function TotalGlobal({ g }: { g: ResultatGlobal }) {
  const ligne = (lib: string, v: number, unite = 'm³', classe = '') => (
    <tr className={classe}>
      <td>{lib}</td>
      <td className="num">
        {fmt(v, 2)} {unite}
      </td>
    </tr>
  );
  return (
    <div className="global-grille">
      <table className="table-detail">
        <tbody>
          <tr className="groupe">
            <th colSpan={2}>Extraction</th>
          </tr>
          {ligne('Fouille totale', g.fouille)}
          {g.decapageEnrobe > 0 && ligne('Décapage enrobé', g.decapageEnrobe)}
          {g.decapageTerre > 0 && ligne('Décapage terre', g.decapageTerre)}
          {ligne('Déblai (hors décapage)', g.deblai)}
          <tr className="groupe">
            <th colSpan={2}>Destination des extraits</th>
          </tr>
          {ligne('Remblai réemployé', g.reemploi, 'm³', 'ligne-reemploi')}
          {ligne('Évacuation', g.evacuation, 'm³', 'ligne-evac')}
        </tbody>
      </table>
      <table className="table-detail">
        <tbody>
          <tr className="groupe">
            <th colSpan={2}>Fournitures</th>
          </tr>
          {g.enrobages.map((e) => (
            <tr key={`enr-${e.nom}`}>
              <td>Enrobage {e.nom.toLowerCase()}</td>
              <td className="num">{fmt(e.volume, 2)} m³</td>
            </tr>
          ))}
          {g.couches.map((c) => (
            <tr key={c.nom}>
              <td>{c.nom}</td>
              <td className="num">{fmt(c.volume, 2)} m³</td>
            </tr>
          ))}
          {ligne('Remblai (besoin)', g.remblai)}
          {ligne('dont remblai d’apport', g.apport, 'm³', 'sous-total')}
          {g.canalisations.length > 0 && <LignesCanalisations c={g.canalisations} colonnes={2} />}
          <tr className="groupe">
            <th colSpan={2}>Divers</th>
          </tr>
          {ligne('Linéaire de tranchée', g.longueur, 'm')}
          {ligne('Emprise en tête', g.surfaceTete, 'm²')}
          {g.surfaceBlindage > 0 && ligne('Blindage', g.surfaceBlindage, 'm²')}
          {ligne('Volume occupé par les tuyaux', g.tuyaux)}
        </tbody>
      </table>
    </div>
  );
}
