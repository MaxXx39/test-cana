import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculProjet } from './calc/engine';
import { ajouterReseau, ajusterLargeur, dupliquerVers, majReseau, insererRegard, normaliserProjet, projetExemple, supprimerRegard, supprimerReseau } from './calc/projet';
import type { Projet, Reseau, Troncon } from './calc/types';
import { CoupeTransversale, type ModeCoupe } from './components/CoupeTransversale';
import { DetailTroncon, TableauTroncons, TotalGlobal } from './components/Resultats';
import { Trace } from './components/Trace';
import { Duplication } from './components/Duplication';
import type { OptionsDuplication } from './calc/projet';
import { TronconEditor } from './components/TronconEditor';
import { exportCsv } from './utils/export';
import { fmt, telecharger } from './utils/format';

/** Build pour un environnement où téléchargements et impression sont bloqués */
const SANS_FICHIERS = import.meta.env.VITE_SANS_FICHIERS === '1';

const CLE_STOCKAGE = 'calcul-tranchees:projet';
const HISTORIQUE_MAX = 100;
/** Les modifications rapprochées (glisser sur la coupe, frappe) forment une seule étape d'annulation */
const REGROUPEMENT_MS = 600;

function charger(): Projet {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut) return normaliserProjet(JSON.parse(brut));
  } catch {
    // stockage indisponible ou contenu illisible : on repart de l'exemple
  }
  return projetExemple();
}

function nomFichier(nom: string, ext: string) {
  return `${nom.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'projet'}.${ext}`;
}

export default function App() {
  const [projet, setProjet] = useState<Projet>(charger);
  const [actif, setActif] = useState(0);
  const [mode, setMode] = useState<ModeCoupe>('moyenne');
  const [selection, setSelection] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ texte: string; libelle: string; action: () => void } | null>(null);
  const passe = useRef<Projet[]>([]);
  const futur = useRef<Projet[]>([]);
  const derniereModif = useRef(0);
  const fichierRef = useRef<HTMLInputElement>(null);

  // Le projet courant est aussi tenu dans une ref : l'historique est mis à jour hors des
  // fonctions de mise à jour de React, qui peuvent être rejouées.
  const courant = useRef(projet);
  const appliquer = useCallback((n: Projet) => {
    courant.current = n;
    setProjet(n);
  }, []);

  const modifier = useCallback(
    (suivant: Projet | ((p: Projet) => Projet)) => {
      const p = courant.current;
      const n = typeof suivant === 'function' ? suivant(p) : suivant;
      if (n === p) return;
      const maintenant = Date.now();
      if (maintenant - derniereModif.current > REGROUPEMENT_MS) {
        passe.current = [...passe.current.slice(-HISTORIQUE_MAX + 1), p];
      }
      derniereModif.current = maintenant;
      futur.current = [];
      appliquer(n);
    },
    [appliquer],
  );

  const annuler = useCallback(() => {
    const precedent = passe.current.pop();
    if (!precedent) return;
    futur.current.push(courant.current);
    derniereModif.current = 0;
    appliquer(precedent);
  }, [appliquer]);

  const retablir = useCallback(() => {
    const suivant = futur.current.pop();
    if (!suivant) return;
    passe.current.push(courant.current);
    derniereModif.current = 0;
    appliquer(suivant);
  }, [appliquer]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const cible = e.target as HTMLElement;
      if (cible.tagName === 'INPUT' && (cible as HTMLInputElement).type === 'text') return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        annuler();
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        retablir();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [annuler, retablir]);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(CLE_STOCKAGE, JSON.stringify(projet));
      } catch {
        // stockage indisponible : la sauvegarde automatique est simplement ignorée
      }
    }, 300);
    return () => clearTimeout(id);
  }, [projet]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const index = Math.min(actif, projet.troncons.length - 1);
  const troncon = projet.troncons[index];
  const resultats = useMemo(() => calculProjet(projet), [projet]);

  const majTroncon = (t: Troncon) => {
    const n = ajusterLargeur(t);
    modifier((p) => ({ ...p, troncons: p.troncons.map((x, i) => (i === index ? n : x)) }));
  };

  const dupliquer = (cibles: number[], options: OptionsDuplication) => {
    modifier((p) => dupliquerVers(p, index, cibles, options));
    setMessage(`Tranchée du tronçon ${index + 1} dupliquée vers ${cibles.length} tronçon${cibles.length > 1 ? 's' : ''}.`);
  };

  const copierTableur = async () => {
    const texte = exportCsv(projet.nom, resultats.troncons, resultats.global, '\t');
    try {
      await navigator.clipboard.writeText(texte);
      setMessage('Résultats copiés : collez-les dans votre tableur.');
    } catch {
      setMessage('La copie a été refusée par le navigateur.');
    }
  };

  const retirerReseau = (r: Reseau) => {
    const n = projet.troncons.filter((t) => t.tuyaux.some((p) => p.reseau === r.id)).length;
    const supprimer = () => modifier((p) => supprimerReseau(p, r.id));
    if (n === 0) supprimer();
    else
      setConfirmation({
        texte: `Supprimer le réseau « ${r.nom} » ? Ses tuyaux seront retirés de ${n} tronçon${n > 1 ? 's' : ''}.`,
        libelle: 'Supprimer le réseau',
        action: supprimer,
      });
  };

  const ouvrir = async (f: File) => {
    try {
      const p = normaliserProjet(JSON.parse(await f.text()));
      modifier(p);
      setActif(0);
      setMessage(`Projet « ${p.nom} » chargé.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  };

  const nouveau = () =>
    setConfirmation({
      texte: 'Remplacer le projet courant par un nouveau projet d’exemple ? (« Annuler » permet de revenir en arrière.)',
      libelle: 'Nouveau projet',
      action: () => {
        modifier({ ...projetExemple(), nom: 'Nouveau projet' });
        setActif(0);
      },
    });

  const choixMode = (
    <div className="segment segment-petit" role="radiogroup" aria-label="Coupe affichée">
      {(['amont', 'moyenne', 'aval'] as ModeCoupe[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'actif' : ''} onClick={() => setMode(m)}>
          {m === 'amont' ? 'Amont' : m === 'aval' ? 'Aval' : 'Milieu'}
        </button>
      ))}
    </div>
  );

  /** Vue générale du tronçon actif, affichée dans le tracé sous ce tronçon */
  const vueGenerale = (
    <div className="vue-generale">
      <div className="vue-generale-barre">
        {choixMode}
        <Duplication projet={projet} index={index} onDupliquer={dupliquer} />
      </div>
      <CoupeTransversale
        troncon={troncon}
        amont={projet.regards[index]}
        aval={projet.regards[index + 1]}
        reseaux={projet.reseaux}
        saisie={projet.saisie}
        mode={mode}
        onChange={majTroncon}
        selection={selection}
        onSelect={setSelection}
      />
    </div>
  );

  return (
    <div className="app">
      <header className="barre">
        <div className="barre-titre">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M3 5h4l2 12h6l2-12h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="2.5" fill="currentColor" />
            </svg>
          </span>
          <input
            className="input-projet"
            value={projet.nom}
            onChange={(e) => modifier((p) => ({ ...p, nom: e.target.value }))}
            aria-label="Nom du projet"
          />
        </div>
        <div className="barre-actions">
          <button type="button" className="btn btn-leger" onClick={annuler} disabled={passe.current.length === 0} title="Annuler (Ctrl+Z)">
            ↶ Annuler
          </button>
          <button type="button" className="btn btn-leger" onClick={retablir} disabled={futur.current.length === 0} title="Rétablir (Ctrl+Y)">
            ↷ Rétablir
          </button>
          <span className="sep" />
          <button type="button" className="btn btn-leger" onClick={nouveau}>
            Nouveau
          </button>
          <button type="button" className="btn btn-leger" onClick={() => fichierRef.current?.click()}>
            Ouvrir…
          </button>
          <input
            ref={fichierRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ouvrir(f);
              e.target.value = '';
            }}
          />
          {!SANS_FICHIERS && (
            <button
              type="button"
              className="btn btn-leger"
              onClick={() => telecharger(nomFichier(projet.nom, 'json'), JSON.stringify(projet, null, 2), 'application/json')}
            >
              Enregistrer
            </button>
          )}
          <button type="button" className="btn btn-leger" onClick={() => void copierTableur()} title="Copie les résultats pour les coller dans Excel">
            Copier pour tableur
          </button>
          {!SANS_FICHIERS && (
            <>
              <button
                type="button"
                className="btn btn-primaire"
                onClick={() =>
                  telecharger(nomFichier(projet.nom, 'csv'), exportCsv(projet.nom, resultats.troncons, resultats.global), 'text/csv;charset=utf-8')
                }
              >
                Export CSV
              </button>
              <button type="button" className="btn btn-leger" onClick={() => window.print()}>
                Imprimer
              </button>
            </>
          )}
        </div>
      </header>

      {confirmation && (
        <div className="confirmation" role="alertdialog" aria-label="Confirmation">
          <p>{confirmation.texte}</p>
          <div className="actions">
            <button type="button" className="btn btn-leger" onClick={() => setConfirmation(null)}>
              Abandonner
            </button>
            <button
              type="button"
              className="btn btn-primaire"
              autoFocus
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {confirmation.libelle}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      <main className="mise">
        <aside className="panneau panneau-trace">
          <h2>Tracé</h2>
          <Trace
            projet={projet}
            resultats={resultats.troncons}
            actif={index}
            vueGenerale={vueGenerale}
            onSelect={(i) => {
              setActif(i);
              setSelection(null);
            }}
            onRegard={(i, r) => modifier((p) => ({ ...p, regards: p.regards.map((x, j) => (j === i ? r : x)) }))}
            onTroncon={(i, t) => modifier((p) => ({ ...p, troncons: p.troncons.map((x, j) => (j === i ? ajusterLargeur(t) : x)) }))}
            onSaisie={(saisie) => modifier((p) => ({ ...p, saisie }))}
            onInserer={(i) => {
              modifier((p) => insererRegard(p, i));
              setActif(Math.max(0, i - 1));
            }}
            onReseau={(r) => modifier((p) => majReseau(p, r))}
            onAjouterReseau={() => modifier(ajouterReseau)}
            onSupprimerReseau={retirerReseau}
            onSupprimer={(i) => {
              modifier((p) => supprimerRegard(p, i));
              setActif((a) => Math.max(0, Math.min(a, i - 1)));
            }}
          />
        </aside>

        <section className="panneau panneau-coupe">
          <div className="titre-actions">
            <h2>
              Tronçon {index + 1} : {projet.regards[index].nom} → {projet.regards[index + 1].nom}
              <span className="titre-sous"> · {fmt(troncon.longueur, 2)} m</span>
            </h2>
            <div className="actions">{choixMode}</div>
          </div>
          <CoupeTransversale
            troncon={troncon}
            amont={projet.regards[index]}
            aval={projet.regards[index + 1]}
            reseaux={projet.reseaux}
            saisie={projet.saisie}
            mode={mode}
            onChange={majTroncon}
            selection={selection}
            onSelect={setSelection}
          />
          <p className="aide aide-coupe">
            Coupe à l’échelle. Saisissez directement sur la coupe les épaisseurs de couches et de décapage, l’écart entre tuyaux et
            l’enrobage du tuyau sélectionné (cliquez un tuyau pour le choisir).
          </p>
          <div className="coupe-bas">
            <TronconEditor
              troncon={troncon}
              amont={projet.regards[index]}
              aval={projet.regards[index + 1]}
              reseaux={projet.reseaux}
              saisie={projet.saisie}
              onChange={majTroncon}
              selection={selection}
              onSelect={setSelection}
            />
            <div className="colonne-detail">
              <h3>Volumes du tronçon</h3>
              <DetailTroncon r={resultats.troncons[index]} />
              <div className="actions actions-col">
                <Duplication projet={projet} index={index} onDupliquer={dupliquer} />
              </div>
            </div>
          </div>
        </section>

        <section className="panneau panneau-resultats">
          <h2>Détail tronçon par tronçon</h2>
          <p className="aide">Volumes en place en m³ ; réemploi et évacuation incluent le foisonnement s’il est coché.</p>
          <TableauTroncons resultats={resultats.troncons} global={resultats.global} actif={index} onSelect={setActif} />
          <h2>Total global</h2>
          <TotalGlobal g={resultats.global} />
        </section>
      </main>
    </div>
  );
}
