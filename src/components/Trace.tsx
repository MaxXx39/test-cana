import type { ReactNode } from 'react';
import type { ModeSaisie, Projet, Regard, Reseau, Troncon } from '../calc/types';
import type { ResultatTroncon } from '../calc/engine';
import { changerDiametre, COULEURS_RESEAUX, diametreParDefaut, poserReseau, retirerReseauTroncon } from '../calc/projet';
import { fmt } from '../utils/format';
import { MiniCoupe } from './MiniCoupe';
import { NumberField } from './NumberField';

interface Props {
  projet: Projet;
  resultats: ResultatTroncon[];
  actif: number;
  /** Vue générale de la tranchée du tronçon actif, affichée sous lui */
  vueGenerale: ReactNode;
  onSelect: (index: number) => void;
  onSaisie: (mode: ModeSaisie) => void;
  onRegard: (index: number, r: Regard) => void;
  onTroncon: (index: number, t: Troncon) => void;
  onInserer: (index: number) => void;
  onSupprimer: (index: number) => void;
  onReseau: (r: Reseau) => void;
  onAjouterReseau: () => void;
  onSupprimerReseau: (r: Reseau) => void;
}

export function PastilleReseau({ couleur }: { couleur: string }) {
  return <span className="pastille-reseau" style={{ background: couleur }} aria-hidden="true" />;
}

/**
 * Saisie du tracé : réseaux, puis regards dans l'ordre avec les tronçons intercalés.
 * Chaque tronçon indique les réseaux posés et leur diamètre ; chaque regard donne,
 * pour les réseaux posés de part et d'autre, le fil d'eau (ou la profondeur).
 */
export function Trace({
  projet,
  resultats,
  actif,
  vueGenerale,
  onSelect,
  onSaisie,
  onRegard,
  onTroncon,
  onInserer,
  onSupprimer,
  onReseau,
  onAjouterReseau,
  onSupprimerReseau,
}: Props) {
  const { reseaux, regards, troncons, saisie } = projet;
  const ordre = reseaux.map((r) => r.id);
  const pose = (t: Troncon | undefined, id: string) => !!t?.tuyaux.some((p) => p.reseau === id);
  /**
   * Lignes du regard i : tous les réseaux (pour pouvoir les poser vers l'aval), sauf au
   * dernier regard où seuls comptent ceux qui arrivent de l'amont.
   */
  const lignesRegard = (i: number) => {
    if (i < troncons.length) return reseaux;
    const arrivent = reseaux.filter((x) => pose(troncons[i - 1], x.id));
    return arrivent.length ? arrivent : reseaux.slice(0, 1);
  };

  return (
    <div className="trace">
      <section className="reseaux">
        <div className="titre-actions">
          <h3>Réseaux</h3>
          <button type="button" className="btn btn-ajout btn-petit" onClick={onAjouterReseau}>
            + Réseau
          </button>
        </div>
        {reseaux.map((r) => {
          const n = troncons.filter((t) => pose(t, r.id)).length;
          return (
            <div key={r.id} className="reseau-ligne">
              <button
                type="button"
                className="pastille-bouton"
                style={{ background: r.couleur }}
                title="Changer la couleur"
                aria-label={`Changer la couleur du réseau ${r.nom}`}
                onClick={() => onReseau({ ...r, couleur: COULEURS_RESEAUX[(COULEURS_RESEAUX.indexOf(r.couleur) + 1) % COULEURS_RESEAUX.length] })}
              />
              <input className="input-nom" value={r.nom} onChange={(e) => onReseau({ ...r, nom: e.target.value })} aria-label="Nom du réseau" list="noms-reseaux" />
              {n ? (
                <span className="reseau-usage">
                  {n} / {troncons.length} tronçons
                </span>
              ) : (
                <span className="reseau-usage reseau-usage-vide" title="Cochez-le dans un tronçon ci-dessous pour le poser">
                  pas encore posé
                </span>
              )}
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
          );
        })}
        <datalist id="noms-reseaux">
          {['EU', 'EP', 'UN', 'AEP', 'Drainage', 'Télécom'].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </section>

      <div className="titre-actions trace-titre">
        <h3>Regards et tronçons</h3>
        <div className="segment segment-petit" role="radiogroup" aria-label="Mode de saisie des regards">
          <button type="button" role="radio" aria-checked={saisie === 'altitudes'} className={saisie === 'altitudes' ? 'actif' : ''} onClick={() => onSaisie('altitudes')}>
            TN + FE
          </button>
          <button type="button" role="radio" aria-checked={saisie === 'profondeurs'} className={saisie === 'profondeurs' ? 'actif' : ''} onClick={() => onSaisie('profondeurs')}>
            Profondeurs
          </button>
        </div>
      </div>
      <p className="aide">
        Dans l’ordre du tracé. À chaque regard, une ligne par réseau : cochez-le s’il part vers le regard suivant, puis saisissez son{' '}
        {saisie === 'altitudes' ? 'fil d’eau (m NGF)' : 'profondeur TN − fil d’eau (m)'} et le diamètre du tuyau vers l’aval.
      </p>
      <div className="regard-fe regard-fe-entete" aria-hidden="true">
        <span title="Posé vers l’aval">↓</span>
        <span />
        <span>Réseau</span>
        <span className="entete-fe">{saisie === 'altitudes' ? 'FE (m)' : 'Prof. (m)'}</span>
        <span className="entete-dia">Ø (mm)</span>
        <span className="num">{saisie === 'altitudes' ? 'Prof.' : ''}</span>
      </div>

      {regards.map((r, i) => {
        const t = troncons[i];
        const res = resultats[i];
        return (
          <div key={r.id}>
            <div className="regard-carte">
              <div className={`regard-tete ${saisie === 'profondeurs' ? 'regard-tete-seule' : ''}`}>
                <input className="input-nom input-regard" value={r.nom} onChange={(e) => onRegard(i, { ...r, nom: e.target.value })} aria-label="Nom du regard" />
                {saisie === 'altitudes' && (
                  <>
                    <span className="regard-lib">TN</span>
                    <NumberField value={r.tn} onChange={(v) => onRegard(i, { ...r, tn: v })} decimales={2} pas={0.01} unite="m" title="Altitude du terrain naturel" />
                  </>
                )}
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
              {lignesRegard(i).map((x) => {
                const fe = r.fe[x.id];
                const prof = r.tn - fe;
                const tuyauAval = t?.tuyaux.find((p) => p.reseau === x.id);
                const poseAmont = pose(troncons[i - 1], x.id);
                const utile = !!tuyauAval || poseAmont;
                return (
                  <div key={x.id} className={`regard-fe ${utile ? '' : 'regard-fe-vide'}`}>
                    {t ? (
                      <input
                        type="checkbox"
                        checked={!!tuyauAval}
                        onChange={(e) =>
                          onTroncon(i, e.target.checked ? poserReseau(t, x.id, diametreParDefaut(projet, x.id), ordre) : retirerReseauTroncon(t, x.id))
                        }
                        title={`${x.nom} posé de ${r.nom} vers ${regards[i + 1].nom}`}
                        aria-label={`${x.nom} posé de ${r.nom} vers ${regards[i + 1].nom}`}
                      />
                    ) : (
                      <span />
                    )}
                    <PastilleReseau couleur={x.couleur} />
                    <span className="regard-fe-nom">{x.nom}</span>
                    {!utile ? (
                      <span className="regard-fe-tiret">—</span>
                    ) : saisie === 'altitudes' ? (
                      <NumberField value={fe} onChange={(v) => onRegard(i, { ...r, fe: { ...r.fe, [x.id]: v } })} decimales={2} pas={0.01} className="col-fe" title={`Fil d’eau ${x.nom} au regard ${r.nom} (m)`} />
                    ) : (
                      <NumberField
                        value={prof}
                        onChange={(v) => onRegard(i, { ...r, fe: { ...r.fe, [x.id]: r.tn - v } })}
                        decimales={2}
                        pas={0.01}
                        className="col-fe"
                        title={`Profondeur ${x.nom} au regard ${r.nom} (m)`}
                      />
                    )}
                    {tuyauAval ? (
                      <NumberField
                        value={tuyauAval.diametre}
                        onChange={(v) => onTroncon(i, changerDiametre(t!, x.id, v))}
                        echelle={1000}
                        decimales={0}
                        min={10}
                        pas={10}
                        className="col-dia"
                        title={`Diamètre extérieur ${x.nom} de ${r.nom} vers ${regards[i + 1].nom} (mm)`}
                      />
                    ) : (
                      <span className="regard-fe-tiret">—</span>
                    )}
                    <span className={`num prof ${utile && prof <= 0 ? 'alerte-texte' : ''}`} title="Profondeur TN − FE">
                      {utile && saisie === 'altitudes' ? fmt(prof, 2) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            {t && (
              <div className={`troncon-bloc ${i === actif ? 'troncon-actif' : ''}`}>
                <div className="troncon-ligne">
                  <button type="button" className={`troncon-select ${i === actif ? 'troncon-select-actif' : ''}`} onClick={() => onSelect(i)} aria-pressed={i === actif} title="Afficher ce tronçon">
                    {i !== actif && <MiniCoupe troncon={t} amont={r} aval={regards[i + 1]} reseaux={reseaux} />}
                    <span className="troncon-textes">
                      <span className="troncon-titre">Tronçon {i + 1}</span>
                      <span className="troncon-sous">
                        {t.type} {fmt(t.largeur, 2)} m{res ? ` · ${fmt(res.fouille, 1)} m³` : ''}
                        {res && res.alertes.length > 0 && <span className="badge-alerte"> · ⚠ {res.alertes.length}</span>}
                      </span>
                    </span>
                  </button>
                  <NumberField value={t.longueur} onChange={(v) => onTroncon(i, { ...t, longueur: v })} decimales={2} unite="m" min={0} pas={1} title="Longueur du tronçon" />
                  <button type="button" className="btn-icone" onClick={() => onInserer(i + 1)} title="Insérer un regard dans ce tronçon" aria-label="Insérer un regard">
                    +
                  </button>
                </div>
                {i === actif && vueGenerale}
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
