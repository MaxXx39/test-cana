import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { etatCoupe, filDEauRegard, filDEauTuyau, geometrieTuyaux, largeurFouille, materiauxEnrobage, nomMateriau, section } from '../calc/engine';
import { changerEcart, classeMateriau, deplacerTuyau, ecartsTuyaux, NOMS_COUCHES, nouvelleCouche, repartirTuyaux, tuyauxGaucheDroite } from '../calc/projet';
import type { ModeSaisie, Regard, Reseau, Troncon } from '../calc/types';
import { fmt } from '../utils/format';
import { NumberField } from './NumberField';

export type ModeCoupe = 'amont' | 'moyenne' | 'aval';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  reseaux: Reseau[];
  /** En saisie par profondeurs, les altitudes ne sont pas affichées */
  saisie: ModeSaisie;
  /** Tranchée reprise du tronçon précédent : épaisseurs affichées sans saisie */
  verrouille?: boolean;
  mode: ModeCoupe;
  onChange: (t: Troncon) => void;
  selection: string | null;
  onSelect: (id: string | null) => void;
}

interface Mise {
  /** px par mètre */
  s: number;
  /** abscisse px de l'axe de la tranchée */
  cx: number;
  vbh: number;
  xSection0: number;
  xSection1: number;
  xEtiquettes: number;
}

/**
 * Gabarit du dessin. Le viewBox suit la largeur réelle du conteneur pour que
 * les textes gardent leur taille ; en dessous de 700 px, les regards sont
 * resserrés et les étiquettes passent en légende sous le dessin.
 */
interface Gabarit {
  vbw: number;
  compact: boolean;
  jauge: number;
  cote: number;
  etiq: number;
  hauteurUtile: number;
}

function gabarit(largeur: number): Gabarit {
  const vbw = Math.max(320, Math.round(largeur));
  const compact = vbw < 700;
  return compact
    ? { vbw, compact, jauge: 70, cote: 40, etiq: 0, hauteurUtile: 340 }
    : { vbw, compact, jauge: 150, cote: 60, etiq: 300, hauteurUtile: 420 };
}

const PAD = 8;
const TOP = 70;
const BAS = 96;
const PAS_ETIQUETTE = 26;
/** Choix de la nature d'une couche, sur l'étiquette */
const NATURE_L = 200;
/** Champs de saisie posés sur le dessin */
const CHAMP_L = 64;
const CHAMP_H = 22;

function miseEnPage(g: Gabarit, largeurMonde: number, profondeurMax: number): Mise {
  const dispo = g.vbw - 2 * PAD - 2 * g.jauge - g.cote - g.etiq - (g.compact ? 4 : 16);
  const s = Math.min(dispo / largeurMonde, g.hauteurUtile / profondeurMax, 900);
  const xSection0 = PAD + g.jauge + g.cote;
  return {
    s,
    cx: xSection0 + dispo / 2,
    vbh: TOP + profondeurMax * s + BAS,
    xSection0,
    xSection1: xSection0 + dispo,
    xEtiquettes: xSection0 + dispo + 16,
  };
}

function barreEchelle(s: number): number {
  for (const l of [0.1, 0.2, 0.25, 0.5, 1, 2, 5]) if (l * s >= 70) return l;
  return 10;
}

const cm = (m: number) => fmt(m * 100, 0);

interface Etiquette {
  y: number;
  ancreX: number;
  ancreY: number;
  /** Nom du matériau */
  texte: string;
  /** Classe du matériau, pour la pastille */
  classe: string;
  /** Épaisseur saisissable (m), ou valeur affichée seulement */
  epaisseur?: { valeur: number; onChange?: (v: number) => void };
  /** Valeur affichée à la place d'une épaisseur (ex. aire d'enrobage) */
  info?: string;
  /** Rang de la couche de structure : sa nature se choisit sur l'étiquette */
  couche?: number;
}

export function CoupeTransversale({ troncon: t, amont, aval, reseaux, saisie, verrouille = false, mode, onChange, selection, onSelect }: Props) {
  const altitudes = saisie === 'altitudes';
  // Les découpes dépendent de l'échelle : identifiants propres à chaque coupe affichée
  const idBase = `coupe${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const boiteRef = useRef<HTMLDivElement>(null);
  const [largeurBoite, setLargeurBoite] = useState(980);
  useEffect(() => {
    const el = boiteRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargeurBoite(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gab = gabarit(largeurBoite);
  const { vbw: VBW, jauge: JAUGE } = gab;

  const reseau = (id: string) => reseaux.find((r) => r.id === id);
  const couleur = (id: string) => reseau(id)?.couleur ?? 'var(--texte-2)';
  // Réseaux posés dans ce tronçon, dans l'ordre du projet
  const presents = reseaux.filter((r) => t.tuyaux.some((p) => p.reseau === r.id));
  const reseauxRegard = presents.length ? presents : reseaux.slice(0, 1);

  const u = mode === 'amont' ? 0 : mode === 'aval' ? 1 : 0.5;
  const tn = amont.tn + (aval.tn - amont.tn) * u;
  const etat = etatCoupe(t, amont, aval, u);
  const H = Math.max(0.05, etat.H);
  const H1 = etatCoupe(t, amont, aval, 0).H;
  const H2 = etatCoupe(t, amont, aval, 1).H;
  const f = t.type === 'V' ? Math.max(0, t.fruit) : 0;
  const W = t.largeur;
  const sec = section(t, H, etat.basTuyaux);
  const geoms = geometrieTuyaux(t, etat.basTuyaux);
  /** Largeur de fouille (blindage compris) en fond, puis en tête */
  const Wf = largeurFouille(t);
  const Wt = Wf + 2 * f * H;

  const profRegards = [amont, aval].flatMap((r) => reseauxRegard.map((x) => r.tn - filDEauRegard(r, x.id)));
  const largeurMonde = Math.max(Wt, ...geoms.map((g) => 2 * Math.max(Math.abs(g.bloc.x0), Math.abs(g.bloc.x1)))) * 1.25 + 0.3;
  const profondeurMax = Math.max(H1, H2, H, 0.5, ...profRegards) + 0.25;
  const m = miseEnPage(gab, largeurMonde, profondeurMax);
  const { s, cx } = m;

  const X = (x: number) => cx + x * s;
  /** depuis une profondeur sous TN */
  const Yz = (z: number) => TOP + z * s;
  /** depuis une hauteur au-dessus du fond */
  const Yy = (y: number) => TOP + (H - y) * s;
  const hw = (z: number) => Wf / 2 + f * (H - z);

  const LIGNE_FE = 14;
  const basJauges =
    Math.max(...[amont, aval].map((r, k) => Math.max(...reseauxRegard.map((x) => Yz(Math.max(0, r.tn - filDEauRegard(r, x.id))) + 6), Yz(k ? H2 : H1)))) +
    16 +
    reseauxRegard.length * LIGNE_FE +
    (gab.compact ? 4 : 20);
  const vbh = Math.max(m.vbh, basJauges);

  const poly = (pts: number[][]) => pts.map((p) => p.join(',')).join(' ');
  const tranchee = poly([
    [X(-Wf / 2), Yy(0)],
    [X(Wf / 2), Yy(0)],
    [X(Wf / 2 + f * H), Yy(H)],
    [X(-Wf / 2 - f * H), Yy(H)],
  ]);
  /** Partie utile, entre blindages : les enrobages y sont rognés */
  const utile = poly([
    [X(-W / 2), Yy(0)],
    [X(W / 2), Yy(0)],
    [X(W / 2 + f * H), Yy(H)],
    [X(-W / 2 - f * H), Yy(H)],
  ]);
  const epBlindage = Wf - W > 1e-9 ? (Wf - W) / 2 : 0;
  const recoupe = t.surface === 'enrobe' && t.recoupe.actif && t.recoupe.largeur > 0;
  // Écarts nu à nu entre tuyaux voisins (de gauche à droite)
  const tries = tuyauxGaucheDroite(t.tuyaux);
  const ecarts = ecartsTuyaux(tries);
  const bande = (z1: number, z2: number) =>
    poly([
      [X(-hw(z1)), Yz(z1)],
      [X(hw(z1)), Yz(z1)],
      [X(hw(z2)), Yz(z2)],
      [X(-hw(z2)), Yz(z2)],
    ]);

  // ----- Saisie sur la coupe -----
  const majCouche = (i: number, v: number) =>
    onChange({ ...t, couches: t.couches.map((c, j) => (j === i ? { ...c, epaisseur: Math.max(0, v) } : c)) });

  /** Champ numérique en cm posé sur le dessin, centré en (x, y) */
  const champ = (cle: string, x: number, y: number, valeur: number, maj: (v: number) => void, titre: string, classe = ''): ReactNode => (
    <foreignObject key={cle} x={x - CHAMP_L / 2} y={y - CHAMP_H / 2} width={CHAMP_L} height={CHAMP_H} className="champ-coupe">
      <NumberField value={valeur} onChange={maj} echelle={100} decimales={1} unite="cm" min={0} pas={1} title={titre} className={`nf-coupe ${classe}`} />
    </foreignObject>
  );

  // ----- Étiquettes -----
  const etiquettes: Etiquette[] = [];
  const zVers = (z: number) => ({ y: Yz(z), ancreX: X(hw(z)), ancreY: Yz(z) });
  // Le décapage n'est pas listé avec la structure : son épaisseur se saisit au-dessus de la coupe
  // Toutes les couches sont listées, même écrêtées, pour rester modifiables
  sec.bornesCouches.forEach(([z1, z2], i) => {
    etiquettes.push({
      ...zVers((z1 + z2) / 2),
      texte: t.couches[i].nom,
      classe: `et-couche-${i % 6}`,
      epaisseur: { valeur: t.couches[i].epaisseur, onChange: verrouille ? undefined : (v) => majCouche(i, v) },
      couche: i,
    });
  });
  const zBasStructure = sec.bornesCouches.length ? Math.max(...sec.bornesCouches.map((b) => b[1])) : 0;
  const zHautEnrobage = H - sec.hautEnrobage;
  if (zHautEnrobage - zBasStructure > 0.005) {
    etiquettes.push({
      ...zVers((zBasStructure + zHautEnrobage) / 2),
      texte: t.remblaiNom,
      classe: 'et-remblai',
      epaisseur: { valeur: zHautEnrobage - zBasStructure },
    });
  }
  // Les tuyaux portent leur nom sur le dessin ; leur détail est listé sous la coupe, de gauche à droite.
  const tuyauxListe = [...geoms].sort((a, b) => a.cx - b.cx);
  // Une étiquette par nature d'enrobage, accrochée au bloc le plus à droite de cette nature
  materiauxEnrobage(t).forEach((nomM, k) => {
    const blocs = geoms.filter((g) => nomMateriau(g.tuyau.enrobage.materiau).toLowerCase() === nomM.toLowerCase());
    if (!blocs.length) return;
    const g = blocs.reduce((a, b) => (b.bloc.x1 > a.bloc.x1 ? b : a));
    const ym = g.bloc.y0 + 0.03;
    etiquettes.push({
      y: Yy(ym),
      ancreX: X(Math.min(g.bloc.x1, hw(H - ym))),
      ancreY: Yy(ym),
      texte: `Enrobage ${nomM.toLowerCase()}`,
      info: `${fmt(sec.enrobages[k], 3)} m²/ml`,
      classe: `et-enrobage enr-${classeMateriau(nomM)}`,
    });
  });
  etiquettes.sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiquettes.length; i++) {
    if (etiquettes[i].y < etiquettes[i - 1].y + PAS_ETIQUETTE) etiquettes[i].y = etiquettes[i - 1].y + PAS_ETIQUETTE;
  }

  const echelle = barreEchelle(s);
  const surfaceEp = Math.max(0.04, t.decapage.actif ? t.decapage.epaisseur : 0.05);
  const xG0 = m.xSection0 - 8;
  const xG1 = m.xSection1 + 8;

  /** Regard : un puits par réseau du tronçon, chacun descendu à son fil d'eau */
  const jauge = (r: Regard, Hr: number, x0: number, titre: string, actif: boolean) => {
    const n = reseauxRegard.length;
    const dispo = JAUGE - 12;
    const pas = dispo / n;
    const lp = gab.compact ? Math.min(26, pas - 6) : Math.min(50, pas - 16);
    const puits = reseauxRegard.map((res, k) => {
      const fe = filDEauRegard(r, res.id);
      return { res, fe, D: Math.max(0, r.tn - fe), xc: x0 + 6 + pas * (k + 0.5) };
    });
    const yTexteFe = Math.max(...puits.map((p) => Yz(p.D) + 6), Yz(Math.max(0, Hr))) + 16;
    const largeurTexte = (texte: string) => texte.length * (gab.compact ? 5.6 : 6.8) + 6;
    return (
      <g className={`jauge ${actif ? 'jauge-active' : ''} ${gab.compact ? 'jauge-compacte' : ''}`}>
        <text x={x0 + JAUGE / 2} y={18} className="jauge-titre" textAnchor="middle">
          {gab.compact ? titre.replace('Regard ', '') : titre}
        </text>
        <text x={x0 + JAUGE / 2} y={36} className="jauge-nom" textAnchor="middle">
          {r.nom || '—'}
        </text>
        <text x={x0 + JAUGE / 2} y={Yz(0) - 8} className="jauge-alt" textAnchor="middle">
          {altitudes ? `TN ${fmt(r.tn, 2)}` : 'TN'}
        </text>
        <line x1={x0 + 2} x2={x0 + JAUGE - 2} y1={Yz(0)} y2={Yz(0)} className="sol-ligne" />
        {Hr > 0 && <line x1={x0 + 2} x2={x0 + JAUGE - 2} y1={Yz(Hr)} y2={Yz(Hr)} className="jauge-fond" />}
        {puits.map((p) => (
          <g key={p.res.id} style={{ color: p.res.couleur }}>
            <title>{`${p.res.nom} : FE ${fmt(p.fe, 2)} · profondeur ${fmt(p.D, 2)} m`}</title>
            <rect x={p.xc - lp / 2} y={Yz(0)} width={lp} height={p.D * s} className="jauge-puits" />
            <rect x={p.xc - lp / 2 - 4} y={Yz(p.D)} width={lp + 8} height={6} className="jauge-radier" />
            {largeurTexte(p.res.nom) <= lp && (
              <text x={p.xc} y={Yz(0) + 14} textAnchor="middle" className="jauge-reseau">
                {p.res.nom}
              </text>
            )}
            {!gab.compact && p.D * s > 70 && lp >= 14 && (
              <text
                x={p.xc}
                y={Yz(p.D / 2) + 14}
                className="jauge-prof"
                textAnchor="middle"
                transform={`rotate(-90 ${p.xc} ${Yz(p.D / 2) + 14})`}
              >
                {fmt(p.D, 2)} m
              </text>
            )}
          </g>
        ))}
        {/* Fils d'eau listés sous le regard, une ligne par réseau */}
        {puits.map((p, k) => (
          <g key={`fe-${p.res.id}`} style={{ color: p.res.couleur }}>
            <circle cx={x0 + 10} cy={yTexteFe + k * LIGNE_FE - 4} r={4} className="jauge-radier" />
            <text x={x0 + 18} y={yTexteFe + k * LIGNE_FE} className="jauge-fe">
              {altitudes
                ? gab.compact
                  ? fmt(p.fe, 2)
                  : `${p.res.nom} ${fmt(p.fe, 2)}`
                : gab.compact
                  ? `${fmt(p.D, 2)} m`
                  : `${p.res.nom} ${fmt(p.D, 2)} m`}
            </text>
          </g>
        ))}
        {!gab.compact && (
          <text x={x0 + 6} y={yTexteFe + n * LIGNE_FE + 4} className="jauge-fouille">
            fouille {fmt(Hr, 2)} m
          </text>
        )}
      </g>
    );
  };

  // Tuyau dont l'enrobage est saisi sur la coupe : le sélectionné, sinon le plus à gauche
  const selectionne = geoms.find((g) => g.tuyau.id === selection) ?? [...geoms].sort((a, b) => a.cx - b.cx)[0];
  const idSel = selectionne?.tuyau.id ?? null;

  // Nom du réseau dans le tuyau s'il y tient, sinon au-dessus, à condition de ne pas
  // chevaucher un autre nom (sinon la couleur et la liste sous la coupe suffisent).
  const nomsTuyaux = new Map<string, 'dedans' | 'dessus'>();
  const boites: [number, number, number][] = [];
  for (const g of geoms) {
    const nom = reseau(g.tuyau.reseau)?.nom ?? '';
    const largeur = nom.length * 6.6 + 4;
    if (2 * (g.r * s - Math.max(3, g.tuyau.paroi * s)) >= largeur) {
      nomsTuyaux.set(g.tuyau.id, 'dedans');
      continue;
    }
    if (gab.compact) continue;
    const y = Yy(g.cy + g.r) - 5;
    const b: [number, number, number] = [X(g.cx) - largeur / 2, X(g.cx) + largeur / 2, y];
    const libre = boites.every(([a0, a1, ay]) => Math.abs(ay - y) > 12 || b[1] < a0 || b[0] > a1);
    const surTuyau = geoms.some((o) => o !== g && Math.hypot(X(o.cx) - X(g.cx), Yy(o.cy) - y) < o.r * s + 6);
    if (libre && !surTuyau) {
      boites.push(b);
      nomsTuyaux.set(g.tuyau.id, 'dessus');
    }
  }

  /** Largeur ajoutée de chaque côté (U, blindage) ou pente du talus (V) */
  const champTypeFouille =
    t.type === 'U' ? (
      <NumberField
        value={t.blindage}
        onChange={(v) => onChange({ ...t, blindage: Math.max(0, v) })}
        echelle={100}
        decimales={1}
        unite="cm"
        min={0}
        pas={1}
        className="nf-coupe nf-type"
        title="Largeur ajoutée de chaque côté pour le blindage (cm)"
      />
    ) : (
      <NumberField
        value={t.fruit}
        onChange={(v) => onChange({ ...t, fruit: Math.max(0, v) })}
        decimales={2}
        unite="H/V"
        min={0}
        pas={0.05}
        className="nf-coupe nf-type"
        title="Pente du talus : élargissement horizontal par mètre de profondeur, de chaque côté"
      />
    );

  /** Nature d'une couche de structure (liste, ou libellé libre avec « Autre… ») et suppression */
  const natureCouche = (i: number) => {
    const c = t.couches[i];
    const connue = NOMS_COUCHES.includes(c.nom);
    const nommer = (nom: string) => onChange({ ...t, couches: t.couches.map((x, j) => (j === i ? { ...x, nom } : x)) });
    return (
      <span className="nature-coupe">
        <select value={connue ? c.nom : ''} onChange={(e) => nommer(e.target.value)} aria-label={`Nature de la couche ${i + 1}`}>
          {NOMS_COUCHES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="">Autre…</option>
        </select>
        {!connue && <input value={c.nom} placeholder="Nature" onChange={(e) => nommer(e.target.value)} aria-label={`Autre nature de la couche ${i + 1}`} />}
        <button
          type="button"
          title="Supprimer cette couche"
          aria-label={`Supprimer la couche ${c.nom}`}
          onClick={() => onChange({ ...t, couches: t.couches.filter((_, j) => j !== i) })}
        >
          ×
        </button>
      </span>
    );
  };

  /** Largeur utile en fond, grisée en largeur automatique */
  const champLargeur = (
    <NumberField
      value={t.largeur}
      onChange={(v) => onChange({ ...t, largeur: Math.max(0.1, v) })}
      decimales={2}
      unite="m"
      min={0.1}
      pas={0.05}
      disabled={t.largeurAuto || verrouille}
      className="nf-coupe nf-type"
      title={t.type === 'U' ? 'Largeur utile en fond, entre blindages (m)' : 'Largeur en fond (m)'}
    />
  );

  /** Valeur en lecture seule posée sur le dessin (pastille) */
  const VAL_L = 44;
  const valeur = (cle: string, x: number, y: number, v: number, titre: string): ReactNode => (
    <g key={cle} className="valeur-coupe">
      <title>{titre}</title>
      <rect x={x - VAL_L / 2} y={y - 9} width={VAL_L} height={18} rx={4} />
      <text x={x} y={y + 4} textAnchor="middle">
        {fmt(v * 100, v * 100 < 10 ? 1 : 0)} cm
      </text>
    </g>
  );

  /** Les quatre épaisseurs d'enrobage d'un tuyau (réglées dans la configuration du réseau), autour de son bloc */
  const enrobageSurCoupe = (g: (typeof geoms)[number]) => {
    const { bloc, cx: gx, cy: gy, r } = g;
    const id = g.tuyau.id;
    const nom = reseau(g.tuyau.reseau)?.nom ?? '';
    const yHaut = Math.min(bloc.y1, H);
    const bandeHaut = (yHaut - (gy + r)) * s;
    const bandeBas = (gy - r - bloc.y0) * s;
    const bandeG = (gx - r - bloc.x0) * s;
    const bandeD = (bloc.x1 - (gx + r)) * s;
    const yH = bandeHaut >= 20 ? Yy((gy + r + yHaut) / 2) : Yy(yHaut) - 11;
    const yB = bandeBas >= 20 ? Yy((bloc.y0 + gy - r) / 2) : Yy(bloc.y0) + 11;
    const xG = bandeG >= VAL_L + 2 ? X((bloc.x0 + gx - r) / 2) : X(bloc.x0) - VAL_L / 2 - 2;
    const xD = bandeD >= VAL_L + 2 ? X((gx + r + bloc.x1) / 2) : X(bloc.x1) + VAL_L / 2 + 2;
    const aide = `(se règle dans Réseaux)`;
    return (
      <g className="enrobage-valeurs">
        {valeur(`eh-${id}`, X(gx), yH, g.tuyau.enrobage.haut, `Enrobage haut ${nom} ${aide}`)}
        {valeur(`eb-${id}`, X(gx), yB, g.tuyau.enrobage.bas, `Lit de pose ${nom} ${aide}`)}
        {valeur(`eg-${id}`, xG, Yy(gy), g.tuyau.enrobage.gauche, `Enrobage gauche ${nom} ${aide}`)}
        {valeur(`ed-${id}`, xD, Yy(gy), g.tuyau.enrobage.droite, `Enrobage droit ${nom} ${aide}`)}
      </g>
    );
  };

  return (
    <div ref={boiteRef} className="coupe-boite">
      <div className="coupe-type" role="group" aria-label="Type de fouille">
        <span className="coupe-type-titre">Fouille</span>
        <div className="segment segment-petit" role="radiogroup" aria-label="Fouille en U ou en V">
          {(['U', 'V'] as const).map((ty) => (
            <button
              key={ty}
              type="button"
              role="radio"
              aria-checked={t.type === ty}
              className={t.type === ty ? 'actif' : ''}
              disabled={verrouille}
              onClick={() => onChange({ ...t, type: ty })}
            >
              {ty === 'U' ? 'En U · blindée' : 'En V · talutée'}
            </button>
          ))}
        </div>
        {/* En mode compact, la largeur ajoutée ou la pente se saisit ici plutôt que sur le dessin */}
        {gab.compact && !verrouille && champTypeFouille}
        <span className="coupe-type-titre">Surface</span>
        <div className="segment segment-petit" role="radiogroup" aria-label="Nature du dessus">
          {(['terre', 'enrobe'] as const).map((su) => (
            <button
              key={su}
              type="button"
              role="radio"
              aria-checked={t.surface === su}
              className={t.surface === su ? 'actif' : ''}
              disabled={verrouille}
              onClick={() => onChange({ ...t, surface: su })}
            >
              {su === 'terre' ? 'Terre' : 'Enrobé'}
            </button>
          ))}
        </div>
        <label className="case">
          <input
            type="checkbox"
            checked={t.decapage.actif}
            disabled={verrouille}
            onChange={(e) => onChange({ ...t, decapage: { ...t.decapage, actif: e.target.checked } })}
          />
          Décapage
        </label>
        {t.decapage.actif && (
          <NumberField
            value={t.decapage.epaisseur}
            onChange={(v) => onChange({ ...t, decapage: { ...t.decapage, epaisseur: Math.max(0, v) } })}
            echelle={100}
            decimales={1}
            unite="cm"
            min={0}
            pas={1}
            disabled={verrouille}
            className="nf-coupe nf-decapage"
            title="Épaisseur de décapage (enrobé ou terre végétale existants)"
          />
        )}
        {t.surface === 'enrobe' && (
          <>
            <label className="case" title="Nouvelle coupe de l’enrobé, plus large, une fois la tranchée refermée">
              <input
                type="checkbox"
                checked={t.recoupe.actif}
                disabled={verrouille}
                onChange={(e) => onChange({ ...t, recoupe: { ...t.recoupe, actif: e.target.checked } })}
              />
              Recoupe d’enrobé
            </label>
            {t.recoupe.actif && (
              <span className="coupe-type-champ">
                <NumberField
                  value={t.recoupe.largeur}
                  onChange={(v) => onChange({ ...t, recoupe: { ...t.recoupe, largeur: Math.max(0, v) } })}
                  echelle={100}
                  decimales={1}
                  unite="cm"
                  min={0}
                  pas={1}
                  disabled={verrouille}
                  className="nf-coupe nf-recoupe"
                  title="Largeur de recoupe au-delà de chaque bord de la tranchée"
                />
                <span className="coupe-type-titre">par côté</span>
              </span>
            )}
          </>
        )}
        <label className="case" title="Largeur ajustée aux tuyaux (enrobages et écarts), tuyaux centrés">
          <input type="checkbox" checked={t.largeurAuto} disabled={verrouille} onChange={(e) => onChange({ ...t, largeurAuto: e.target.checked })} />
          Largeur auto
        </label>
        {gab.compact && !verrouille && champLargeur}
        {!verrouille && (
          <button
            type="button"
            className="btn btn-ajout btn-petit"
            onClick={() => onChange({ ...t, couches: [...t.couches, nouvelleCouche('Grave 0/31.5', 0.2)] })}
            title="Ajouter une couche de structure sous les autres"
          >
            + Couche
          </button>
        )}
      </div>
      {tries.length > 1 && (
        <div className="coupe-type coupe-ordre" role="group" aria-label="Ordre des réseaux dans la fouille">
          <span className="coupe-type-titre">Ordre dans la fouille (gauche → droite)</span>
          {tries.map((x, k) => {
            const r = reseau(x.reseau);
            return (
              <span key={x.id} className="ordre-reseau" style={{ borderColor: r?.couleur, color: r?.couleur }}>
                <button type="button" disabled={k === 0} onClick={() => onChange(deplacerTuyau(t, x.id, -1))} aria-label={`Décaler ${r?.nom} vers la gauche`}>
                  ◀
                </button>
                {r?.nom}
                <button
                  type="button"
                  disabled={k === tries.length - 1}
                  onClick={() => onChange(deplacerTuyau(t, x.id, 1))}
                  aria-label={`Décaler ${r?.nom} vers la droite`}
                >
                  ▶
                </button>
              </span>
            );
          })}
          <button
            type="button"
            className="btn btn-leger btn-petit"
            onClick={() => {
              const r = repartirTuyaux(tries);
              onChange({ ...t, tuyaux: r.tuyaux, largeur: t.largeurAuto ? r.largeur : Math.max(t.largeur, r.largeur) });
            }}
            title="Écarts ramenés à des enrobages jointifs, tuyaux centrés"
          >
            Enrobages jointifs
          </button>
        </div>
      )}
      <svg className="coupe" viewBox={`0 0 ${VBW} ${vbh}`} role="group" aria-label="Coupe transversale de la tranchée">
        <defs>
          <clipPath id={`${idBase}-fouille`}>
            <polygon points={tranchee} />
          </clipPath>
          <clipPath id={`${idBase}-utile`}>
            <polygon points={utile} />
          </clipPath>
          <pattern id="hachures-blindage" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hachure-blindage" />
          </pattern>
          <pattern id="gravier" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="2" className="grain-gravier" />
            <circle cx="9" cy="8.5" r="1.6" className="grain-gravier" />
          </pattern>
          <pattern id="sable" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" className="grain" />
            <circle cx="5.5" cy="5" r="0.7" className="grain" />
          </pattern>
          <pattern id="hachures-sol" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" className="hachure" />
          </pattern>
        </defs>

        {jauge(amont, H1, PAD, 'Regard amont', mode === 'amont')}
        {jauge(aval, H2, VBW - PAD - JAUGE, 'Regard aval', mode === 'aval')}

        {/* Terrain encaissant */}
        <rect x={xG0} y={Yz(0)} width={xG1 - xG0} height={(profondeurMax - 0.02) * s} className="sol" />
        <rect x={xG0} y={Yz(0)} width={xG1 - xG0} height={(profondeurMax - 0.02) * s} fill="url(#hachures-sol)" />
        <rect x={xG0} y={Yz(0)} width={xG1 - xG0} height={surfaceEp * s} className={t.surface === 'enrobe' ? 'surface-enrobe' : 'surface-terre'} />

        {/* Tranchée : remblai, enrobages, structure */}
        <polygon points={tranchee} className="remblai" />
        <g clipPath={`url(#${idBase}-utile)`}>
          {geoms.map((g) => (
            <rect
              key={g.tuyau.id}
              x={X(g.bloc.x0)}
              y={Yy(Math.min(g.bloc.y1, H))}
              width={(g.bloc.x1 - g.bloc.x0) * s}
              height={Math.max(0, Math.min(g.bloc.y1, H) - g.bloc.y0) * s}
              className={`enrobage enr-${classeMateriau(g.tuyau.enrobage.materiau)} ${g.tuyau.id === idSel ? 'enrobage-sel' : ''}`}
            />
          ))}
          {geoms.map((g) => (
            <rect
              key={`grain-${g.tuyau.id}`}
              x={X(g.bloc.x0)}
              y={Yy(Math.min(g.bloc.y1, H))}
              width={(g.bloc.x1 - g.bloc.x0) * s}
              height={Math.max(0, Math.min(g.bloc.y1, H) - g.bloc.y0) * s}
              fill={classeMateriau(g.tuyau.enrobage.materiau) === 'gravier' ? 'url(#gravier)' : classeMateriau(g.tuyau.enrobage.materiau) === 'beton' ? 'none' : 'url(#sable)'}
              pointerEvents="none"
            />
          ))}
        </g>
        <g clipPath={`url(#${idBase}-fouille)`}>
          {sec.bornesCouches.map(([z1, z2], i) =>
            z2 > z1 ? <polygon key={t.couches[i].id} points={bande(z1, z2)} className={`couche couche-${i % 6}`} /> : null,
          )}
        </g>
        <polygon points={tranchee} className="tranchee-contour" />
        {t.type === 'U' && (
          <>
            {epBlindage > 0 ? (
              [-1, 1].map((cote) => (
                <rect
                  key={cote}
                  x={cote < 0 ? X(-Wf / 2) : X(W / 2)}
                  y={Yy(H)}
                  width={epBlindage * s}
                  height={H * s}
                  className="blindage-panneau"
                >
                  <title>{`Blindage · ${cm(epBlindage)} cm`}</title>
                </rect>
              ))
            ) : (
              <>
                <line x1={X(-W / 2) - 3} x2={X(-W / 2) - 3} y1={Yy(0)} y2={Yy(H)} className="blindage" />
                <line x1={X(W / 2) + 3} x2={X(W / 2) + 3} y1={Yy(0)} y2={Yy(H)} className="blindage" />
              </>
            )}
          </>
        )}
        {t.decapage.actif && (
          <line
            x1={X(-hw(t.decapage.epaisseur))}
            x2={X(hw(t.decapage.epaisseur))}
            y1={Yz(Math.min(t.decapage.epaisseur, H))}
            y2={Yz(Math.min(t.decapage.epaisseur, H))}
            className="ligne-decapage"
          />
        )}
        {/* Recoupe d'enrobé : bandes de part et d'autre de la tranchée, coupées à leur bord extérieur */}
        {recoupe &&
          [-1, 1].map((c) => {
            const x0 = c < 0 ? X(-Wt / 2 - t.recoupe.largeur) : X(Wt / 2);
            const xc = c < 0 ? X(-Wt / 2 - t.recoupe.largeur) : X(Wt / 2 + t.recoupe.largeur);
            return (
              <g key={c} className="recoupe">
                <title>{`Recoupe d’enrobé · ${cm(t.recoupe.largeur)} cm`}</title>
                <rect x={x0} y={Yz(0)} width={t.recoupe.largeur * s} height={Math.max(2, Math.min(t.decapage.epaisseur, H) * s)} className="bande-recoupe" />
                <line x1={xc} x2={xc} y1={Yz(0) - 7} y2={Yz(Math.min(t.decapage.epaisseur, H)) + 3} className="trait-coupe" />
              </g>
            );
          })}
        {t.surface === 'enrobe' &&
          [-1, 1].map((c) => (
            <line key={`dec-${c}`} x1={X((c * Wt) / 2)} x2={X((c * Wt) / 2)} y1={Yz(0) - 5} y2={Yz(0) + 3} className="trait-coupe trait-decoupe">
              <title>Découpe de l’enrobé</title>
            </line>
          ))}
        <line x1={xG0} x2={xG1} y1={Yz(0)} y2={Yz(0)} className="sol-ligne" />

        {/* Tuyaux, à la couleur de leur réseau */}
        {geoms.map((g) => {
          const ep = Math.max(3, g.tuyau.paroi * s);
          const sel = g.tuyau.id === idSel;
          return (
            <g
              key={g.tuyau.id}
              className={`tuyau ${sel ? 'tuyau-sel' : ''}`}
              style={{ color: couleur(g.tuyau.reseau) }}
              onClick={() => onSelect(g.tuyau.id)}
            >
              <title>{`${reseau(g.tuyau.reseau)?.nom ?? ''} Ø${fmt(g.tuyau.diametre * 1000, 0)} — cliquer pour saisir son enrobage`}</title>
              {sel && <circle cx={X(g.cx)} cy={Yy(g.cy)} r={g.r * s + 4} className="tuyau-halo" />}
              <circle cx={X(g.cx)} cy={Yy(g.cy)} r={g.r * s} className="tuyau-paroi" />
              <circle cx={X(g.cx)} cy={Yy(g.cy)} r={Math.max(1, g.r * s - ep)} className="tuyau-int" />
              {nomsTuyaux.has(g.tuyau.id) && (
                <text
                  x={X(g.cx)}
                  y={nomsTuyaux.get(g.tuyau.id) === 'dedans' ? Yy(g.cy) + 4 : Yy(g.cy + g.r) - 5}
                  textAnchor="middle"
                  className={`tuyau-texte ${nomsTuyaux.get(g.tuyau.id) === 'dedans' ? '' : 'tuyau-texte-ext'}`}
                >
                  {reseau(g.tuyau.reseau)?.nom}
                </text>
              )}
            </g>
          );
        })}

        {/* Largeur ajoutée de chaque côté (blindage, U) ou pente du talus (V), saisie sur la coupe */}
        {!gab.compact && (
          <g className="saisie-type">
            <text x={X(Wt / 2) + 10} y={Yz(0) - 34} className="cote-texte">
              {t.type === 'U' ? 'blindage / côté' : 'talus H/V'}
            </text>
            {verrouille ? (
              <text x={X(Wt / 2) + 10} y={Yz(0) - 10} className="etiquette-valeur">
                {t.type === 'U' ? `${fmt(t.blindage * 100, 1)} cm` : fmt(t.fruit, 2)}
              </text>
            ) : (
              <foreignObject x={X(Wt / 2) + 8} y={Yz(0) - 30} width={CHAMP_L + 8} height={CHAMP_H} className="champ-coupe">
                {champTypeFouille}
              </foreignObject>
            )}
          </g>
        )}

        {/* Cotes */}
        <g className="cote">
          <line x1={X(-Wt / 2) - 36} x2={X(-Wt / 2) - 36} y1={Yz(0)} y2={Yz(H)} />
          <line x1={X(-Wt / 2) - 42} x2={X(-Wt / 2) - 30} y1={Yz(0)} y2={Yz(0)} />
          <line x1={X(-Wt / 2) - 42} x2={X(-W / 2)} y1={Yz(H)} y2={Yz(H)} />
          <text
            x={X(-Wt / 2) - 42}
            y={Yz(H / 2)}
            transform={`rotate(-90 ${X(-Wt / 2) - 42} ${Yz(H / 2)})`}
            textAnchor="middle"
            className="cote-texte"
          >
            H = {fmt(H, 2)} m
          </text>
          <line x1={X(-W / 2)} x2={X(W / 2)} y1={Yy(0) + 32} y2={Yy(0) + 32} />
          <line x1={X(-W / 2)} x2={X(-W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 38} />
          <line x1={X(W / 2)} x2={X(W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 38} />
          {gab.compact || verrouille ? (
            <text x={X(0)} y={Yy(0) + 50} textAnchor="middle" className="cote-texte">
              {epBlindage <= 0
                ? `${fmt(W, 2)} m`
                : gab.compact
                  ? `${fmt(W, 2)} m + 2 × ${cm(epBlindage)} cm`
                  : `${fmt(W, 2)} m utile · fouille ${fmt(Wf, 2)} m (blindage ${cm(epBlindage)} cm)`}
            </text>
          ) : (
            <>
              <foreignObject x={X(0) - 44} y={Yy(0) + 40} width={88} height={CHAMP_H} className="champ-coupe">
                {champLargeur}
              </foreignObject>
              <text x={X(0) + 50} y={Yy(0) + 55} className="cote-texte">
                {t.largeurAuto ? 'auto' : ''}
                {epBlindage > 0 ? `${t.largeurAuto ? ' · ' : ''}fouille ${fmt(Wf, 2)} m` : ''}
                {recoupe ? ` · recoupe ${fmt(Wt + 2 * t.recoupe.largeur, 2)} m` : ''}
              </text>
            </>
          )}
          {/* Écarts nu à nu entre tuyaux voisins */}
          {tries.slice(1).map((b, i) => {
            const ga = geoms.find((g) => g.tuyau.id === tries[i].id)!;
            const gb = geoms.find((g) => g.tuyau.id === b.id)!;
            const e = ecarts[i + 1];
            const x1 = X(ga.cx + ga.r);
            const x2 = X(gb.cx - gb.r);
            const y = Yy(Math.min(ga.cy, gb.cy));
            return (
              <g key={b.id} className="cote-ecart">
                {/* lignes de rappel depuis les génératrices latérales, si les tuyaux sont à des hauteurs différentes */}
                {Math.abs(Yy(ga.cy) - y) > 1 && <line x1={x1} x2={x1} y1={Yy(ga.cy)} y2={y} className="rappel" />}
                {Math.abs(Yy(gb.cy) - y) > 1 && <line x1={x2} x2={x2} y1={Yy(gb.cy)} y2={y} className="rappel" />}
                <line x1={x1} x2={x2} y1={y} y2={y} />
                <line x1={x1} x2={x1} y1={y - 4} y2={y + 4} />
                <line x1={x2} x2={x2} y1={y - 4} y2={y + 4} />
                {!gab.compact &&
                  champ(
                    `ecart-${b.id}`,
                    (x1 + x2) / 2,
                    // sous la cote, pour ne pas masquer l'enrobage latéral affiché à hauteur d'axe
                    y + CHAMP_H / 2 + 10,
                    e,
                    (v) => onChange(changerEcart(t, b.id, v)),
                    `Écart nu à nu entre ${reseau(tries[i].reseau)?.nom} et ${reseau(b.reseau)?.nom}`,
                    'nf-ecart',
                  )}
              </g>
            );
          })}
          {t.type === 'V' && (
            <>
              <line x1={X(-Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 16} y2={Yz(0) - 16} />
              <line x1={X(-Wt / 2)} x2={X(-Wt / 2)} y1={Yz(0) - 22} y2={Yz(0) - 4} />
              <line x1={X(Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 22} y2={Yz(0) - 4} />
              <text x={X(0)} y={Yz(0) - 22} textAnchor="middle" className="cote-texte">
                {fmt(Wt, 2)} m en tête
              </text>
            </>
          )}
        </g>

        {/* Étiquettes */}
        {!gab.compact &&
          etiquettes.map((e, i) => (
            <g key={i} className={`etiquette ${e.classe}`}>
              <polyline points={`${e.ancreX + 2},${e.ancreY} ${m.xEtiquettes - 8},${e.y} ${m.xEtiquettes - 2},${e.y}`} className="etiquette-trait" />
              <circle cx={e.ancreX + 2} cy={e.ancreY} r={2} className="etiquette-point" />
              <rect x={m.xEtiquettes} y={e.y - 5} width={10} height={10} rx={2} className={`etiquette-pastille ${e.classe}`} />
              {e.epaisseur?.onChange ? (
                champ(`et-${i}`, m.xEtiquettes + 16 + CHAMP_L / 2, e.y, e.epaisseur.valeur, e.epaisseur.onChange, `Épaisseur : ${e.texte}`)
              ) : (
                <text x={m.xEtiquettes + 16 + CHAMP_L - 6} y={e.y + 4} textAnchor="end" className="etiquette-valeur">
                  {e.epaisseur ? `${fmt(e.epaisseur.valeur * 100, 1)} cm` : e.info}
                </text>
              )}
              {e.couche !== undefined && !verrouille ? (
                <foreignObject x={m.xEtiquettes + 20 + CHAMP_L} y={e.y - CHAMP_H / 2} width={NATURE_L} height={CHAMP_H} className="champ-coupe">
                  {natureCouche(e.couche)}
                </foreignObject>
              ) : (
                <text x={m.xEtiquettes + 22 + CHAMP_L} y={e.y + 4} className="etiquette-texte">
                  {e.texte}
                </text>
              )}
            </g>
          ))}

        {/* Échelle */}
        <g className="echelle">
          <rect x={m.xSection0} y={vbh - 22} width={echelle * s} height={4} />
          <text x={m.xSection0} y={vbh - 28} className="cote-texte">
            {echelle >= 1 ? `${fmt(echelle, 0)} m` : `${fmt(echelle * 100, 0)} cm`}
          </text>
        </g>

        {/* Enrobage du tuyau sélectionné, affiché sur la coupe */}
        {/* seulement s'il y a la place : sinon les valeurs restent lisibles dans Réseaux */}
        {selectionne && !gab.compact && (selectionne.bloc.x1 - selectionne.bloc.x0) * s >= 2.4 * 44 && enrobageSurCoupe(selectionne)}
      </svg>
      {tuyauxListe.length > 0 && (
        <ul className="liste-reseaux-coupe" aria-label="Tuyaux de la coupe, de gauche à droite">
          {tuyauxListe.map((g) => {
            const fe = filDEauTuyau(g.tuyau, amont, aval, u);
            return (
              <li key={g.tuyau.id}>
                <button
                  type="button"
                  className={g.tuyau.id === idSel ? 'actif' : ''}
                  style={{ '--pastille': couleur(g.tuyau.reseau) } as CSSProperties}
                  onClick={() => onSelect(g.tuyau.id)}
                >
                  <strong>
                    {reseau(g.tuyau.reseau)?.nom} Ø{fmt(g.tuyau.diametre * 1000, 0)}
                  </strong>
                  <span>
                    {altitudes && `FE ${fmt(fe, 2)} · `}prof. {fmt(tn - fe, 2)} m
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {gab.compact && selectionne && (
        <div className="saisie-tuyau" style={{ '--pastille': couleur(selectionne.tuyau.reseau) } as CSSProperties}>
          <strong>
            {reseau(selectionne.tuyau.reseau)?.nom} Ø{fmt(selectionne.tuyau.diametre * 1000, 0)}
          </strong>
          <span title="Se règle dans la configuration des réseaux">
            enrobage haut {fmt(selectionne.tuyau.enrobage.haut * 100, 0)} · lit {fmt(selectionne.tuyau.enrobage.bas * 100, 0)} · gauche{' '}
            {fmt(selectionne.tuyau.enrobage.gauche * 100, 0)} · droite {fmt(selectionne.tuyau.enrobage.droite * 100, 0)} cm
          </span>
          {(() => {
            const k = tries.findIndex((x) => x.id === selectionne.tuyau.id);
            if (k <= 0) return null;
            return (
              <label className="saisie-tuyau-champ">
                écart avec {reseau(tries[k - 1].reseau)?.nom}
                <NumberField
                  value={ecarts[k]}
                  onChange={(v) => onChange(changerEcart(t, selectionne.tuyau.id, v))}
                  echelle={100}
                  decimales={1}
                  unite="cm"
                  min={0}
                  pas={1}
                  className="nf-coupe nf-ecart"
                />
              </label>
            );
          })()}
        </div>
      )}
      {gab.compact && (
        <ul className="legende">
          {etiquettes.map((e, i) => (
            <li key={i} className={e.classe}>
              {e.epaisseur?.onChange ? (
                <NumberField value={e.epaisseur.valeur} onChange={e.epaisseur.onChange} echelle={100} decimales={1} unite="cm" min={0} pas={1} className="nf-coupe" />
              ) : (
                <span className="legende-valeur">{e.epaisseur ? `${fmt(e.epaisseur.valeur * 100, 1)} cm` : e.info}</span>
              )}
              {e.couche !== undefined && !verrouille ? natureCouche(e.couche) : e.texte}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
