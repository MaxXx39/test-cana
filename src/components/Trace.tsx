import type { ModeSaisie, Projet, Regard, Reseau, Troncon } from '../calc/types';
import type { ResultatTroncon } from '../calc/engine';
import { changerDiametre, COULEURS_RESEAUX, diametreParDefaut, poserReseau, retirerReseauTroncon } from '../calc/projet';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  projet: Projet;
  resultats: ResultatTroncon[];
  actif: number;
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
  /** Réseaux à renseigner au regard i : ceux posés dans les tronçons voisins */
  const reseauxAuRegard = (i: number) => {
    const liste = reseaux.filter((x) => pose(troncons[i - 1], x.id) || pose(troncons[i], x.id));
    return liste.length ? liste : reseaux.slice(0, 1);
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
        {saisie === 'altitudes'
          ? 'Altitudes en m NGF, dans l’ordre du tracé. Cochez les réseaux posés dans chaque tronçon.'
          : 'Profondeur TN − fil d’eau en m, dans l’ordre du tracé. Cochez les réseaux posés dans chaque tronçon.'}
      </p>

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
              {reseauxAuRegard(i).map((x) => {
                const fe = r.fe[x.id];
                const prof = r.tn - fe;
                return (
                  <div key={x.id} className="regard-fe">
                    <PastilleReseau couleur={x.couleur} />
                    <span className="regard-fe-nom">
                      {saisie === 'altitudes' ? 'FE' : 'Prof.'} {x.nom}
                    </span>
                    {saisie === 'altitudes' ? (
                      <>
                        <NumberField value={fe} onChange={(v) => onRegard(i, { ...r, fe: { ...r.fe, [x.id]: v } })} decimales={2} pas={0.01} unite="m" title={`Fil d’eau ${x.nom}`} />
                        <span className={`num prof ${prof <= 0 ? 'alerte-texte' : ''}`} title="Profondeur TN − FE">
                          {fmt(prof, 2)} m
                        </span>
                      </>
                    ) : (
                      <>
                        <NumberField
                          value={prof}
                          onChange={(v) => onRegard(i, { ...r, fe: { ...r.fe, [x.id]: r.tn - v } })}
                          decimales={2}
                          pas={0.01}
                          unite="m"
                          title={`Profondeur ${x.nom} (TN − fil d’eau)`}
                        />
                        <span />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {t && (
              <div className={`troncon-bloc ${i === actif ? 'troncon-actif' : ''}`}>
                <div className="troncon-ligne">
                  <button type="button" className="troncon-select" onClick={() => onSelect(i)} aria-pressed={i === actif}>
                    <span className="troncon-titre">Tronçon {i + 1}</span>
                    <span className="troncon-sous">
                      {t.type} {fmt(t.largeur, 2)} m{res ? ` · ${fmt(res.fouille, 1)} m³` : ''}
                      {res && res.alertes.length > 0 && <span className="badge-alerte"> · ⚠ {res.alertes.length}</span>}
                    </span>
                  </button>
                  <NumberField value={t.longueur} onChange={(v) => onTroncon(i, { ...t, longueur: v })} decimales={2} unite="m" min={0} pas={1} title="Longueur du tronçon" />
                  <button type="button" className="btn-icone" onClick={() => onInserer(i + 1)} title="Insérer un regard dans ce tronçon" aria-label="Insérer un regard">
                    +
                  </button>
                </div>
                <div className="troncon-tuyaux">
                  {reseaux.map((x) => {
                    const tuyau = t.tuyaux.find((p) => p.reseau === x.id);
                    return (
                      <div key={x.id} className={`tuyau-choix ${tuyau ? 'tuyau-choix-pose' : ''}`}>
                        <label className="case">
                          <input
                            type="checkbox"
                            checked={!!tuyau}
                            onChange={(e) =>
                              onTroncon(i, e.target.checked ? poserReseau(t, x.id, diametreParDefaut(projet, x.id), ordre) : retirerReseauTroncon(t, x.id))
                            }
                            aria-label={`Réseau ${x.nom} posé dans le tronçon ${i + 1}`}
                          />
                          <PastilleReseau couleur={x.couleur} />
                          <span className="tuyau-choix-nom">{x.nom}</span>
                        </label>
                        {tuyau ? (
                          <NumberField
                            value={tuyau.diametre}
                            onChange={(v) => onTroncon(i, changerDiametre(t, x.id, v))}
                            echelle={1000}
                            decimales={0}
                            unite="mm"
                            min={10}
                            pas={10}
                            title={`Diamètre extérieur ${x.nom}`}
                          />
                        ) : (
                          <span className="tuyau-choix-vide">non posé</span>
                        )}
                      </div>
                    );
                  })}
                </div>
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
