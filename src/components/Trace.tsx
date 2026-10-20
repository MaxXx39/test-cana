import type { Projet, Regard, Reseau } from '../calc/types';
import type { ResultatTroncon } from '../calc/engine';
import { COULEURS_RESEAUX } from '../calc/projet';
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
  onReseau: (r: Reseau) => void;
  onAjouterReseau: () => void;
  onSupprimerReseau: (r: Reseau) => void;
}

export function PastilleReseau({ couleur }: { couleur: string }) {
  return <span className="pastille-reseau" style={{ background: couleur }} aria-hidden="true" />;
}

/** Saisie du tracé : réseaux, puis regards dans l'ordre avec les tronçons intercalés */
export function Trace({ projet, resultats, actif, onSelect, onRegard, onLongueur, onInserer, onSupprimer, onReseau, onAjouterReseau, onSupprimerReseau }: Props) {
  const { reseaux, regards, troncons } = projet;
  const utilise = (id: string, ...indices: number[]) => indices.some((i) => troncons[i]?.tuyaux.some((p) => p.reseau === id));

  return (
    <div className="trace">
      <section className="reseaux">
        <div className="titre-actions">
          <h3>Réseaux</h3>
          <button type="button" className="btn btn-ajout btn-petit" onClick={onAjouterReseau}>
            + Réseau
          </button>
        </div>
        {reseaux.map((r) => (
          <div key={r.id} className="reseau-ligne">
            <button
              type="button"
              className="pastille-bouton"
              style={{ background: r.couleur }}
              title="Changer la couleur"
              aria-label={`Changer la couleur du réseau ${r.nom}`}
              onClick={() => onReseau({ ...r, couleur: COULEURS_RESEAUX[(COULEURS_RESEAUX.indexOf(r.couleur) + 1) % COULEURS_RESEAUX.length] })}
            />
            <input
              className="input-nom"
              value={r.nom}
              onChange={(e) => onReseau({ ...r, nom: e.target.value })}
              aria-label="Nom du réseau"
              list="noms-reseaux"
            />
            {(() => {
              const n = troncons.filter((t) => t.tuyaux.some((p) => p.reseau === r.id)).length;
              return n ? (
                <span className="reseau-usage">
                  {n} / {troncons.length} tronçons
                </span>
              ) : (
                <span className="reseau-usage reseau-usage-vide" title="Posez-le dans un tronçon : fiche du tronçon, « Réseaux dans ce tronçon »">
                  pas encore posé
                </span>
              );
            })()}
            <button
              type="button"
              className="btn-icone"
              disabled={reseaux.length <= 1}
              onClick={() => onSupprimerReseau(r)}
              title="Supprimer ce réseau"
              aria-label={`Supprimer le réseau ${r.nom}`}
            >
              ×
            </button>
          </div>
        ))}
        <datalist id="noms-reseaux">
          {['EU', 'EP', 'UN', 'AEP', 'Drainage'].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </section>

      <h3 className="trace-titre">Regards et tronçons</h3>
      <p className="aide">Altitudes en m NGF, dans l’ordre du tracé. Un fil d’eau par réseau.</p>
      {regards.map((r, i) => {
        const t = troncons[i];
        const res = resultats[i];
        return (
          <div key={r.id}>
            <div className="regard-carte">
              <div className="regard-tete">
                <input className="input-nom input-regard" value={r.nom} onChange={(e) => onRegard(i, { ...r, nom: e.target.value })} aria-label="Nom du regard" />
                <span className="regard-lib">TN</span>
                <NumberField value={r.tn} onChange={(v) => onRegard(i, { ...r, tn: v })} decimales={2} pas={0.01} title="Altitude du terrain naturel (m)" />
                <button
                  type="button"
                  className="btn-icone"
                  disabled={regards.length <= 2}
                  onClick={() => onSupprimer(i)}
                  title="Supprimer ce regard"
                  aria-label={`Supprimer le regard ${r.nom}`}
                >
                  ×
                </button>
              </div>
              {reseaux.map((x) => {
                const fe = r.fe[x.id];
                const prof = r.tn - fe;
                return (
                  <div key={x.id} className="regard-fe">
                    <PastilleReseau couleur={x.couleur} />
                    <span className="regard-fe-nom">
                      FE {x.nom}
                      {!utilise(x.id, i - 1, i) && (
                        <span className="non-pose" title="Aucun tuyau de ce réseau dans les tronçons de part et d’autre de ce regard">
                          {' '}
                          · non posé
                        </span>
                      )}
                    </span>
                    <NumberField
                      value={fe}
                      onChange={(v) => onRegard(i, { ...r, fe: { ...r.fe, [x.id]: v } })}
                      decimales={2}
                      pas={0.01}
                      title={`Fil d’eau ${x.nom} (m)`}
                    />
                    <span className={`num prof ${prof <= 0 ? 'alerte-texte' : ''}`} title="Profondeur TN − FE">
                      {fmt(prof, 2)} m
                    </span>
                  </div>
                );
              })}
            </div>
            {t && (
              <div className={`troncon-ligne ${i === actif ? 'troncon-actif' : ''}`}>
                <button type="button" className="troncon-select" onClick={() => onSelect(i)} aria-pressed={i === actif}>
                  <span className="troncon-titre">
                    Tronçon {i + 1}
                    <span className="troncon-reseaux">
                      {reseaux
                        .filter((x) => t.tuyaux.some((p) => p.reseau === x.id))
                        .map((x) => (
                          <span key={x.id} className="puce-reseau" style={{ borderColor: x.couleur, color: x.couleur }}>
                            {x.nom}
                          </span>
                        ))}
                    </span>
                  </span>
                  <span className="troncon-sous">
                    {t.type} {fmt(t.largeur, 2)} m{res ? ` · ${fmt(res.fouille, 1)} m³` : ''}
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
      <button type="button" className="btn btn-ajout btn-plein" onClick={() => onInserer(regards.length)}>
        + Regard en fin de tracé
      </button>
    </div>
  );
}
