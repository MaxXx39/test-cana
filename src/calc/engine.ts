import type { OptionsMateriau, Projet, Regard, Reseau, SurfaceNature, Troncon, Tuyau } from './types';

/*
 * Repère de la coupe transversale : x horizontal, 0 sur l'axe de la tranchée ;
 * y vertical, 0 au fond de fouille, positif vers le haut. H est la profondeur
 * totale de fouille (du terrain naturel au fond de fouille).
 *
 * Chaque tuyau appartient à un réseau (EU, EP…) dont le fil d'eau est saisi à
 * chaque regard : plusieurs réseaux peuvent partager la tranchée à des
 * profondeurs différentes. Le fond de fouille, plat
 * sur toute la largeur, est calé sous le tuyau le plus exigeant :
 * fond = min(FE − paroi − enrobage bas). Le bloc d'enrobage d'un tuyau part de
 * son propre lit ; sous un réseau plus haut, l'espace est remblayé.
 *
 * Le long du tronçon (abscisse relative u de 0 à 1), TN et fils d'eau varient
 * linéairement. On intègre par Simpson entre les points où le tuyau qui fixe le
 * fond change : sur chaque morceau, H est affine et l'intégration est exacte pour
 * la fouille, le décapage et la structure (polynômes de degré ≤ 2 en H).
 */

const SIMPSON_INTERVALLES = 20;

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Fil d'eau d'un réseau à un regard ; à défaut, le plus profond des fils d'eau saisis */
export function filDEauRegard(r: Regard, reseau: string): number {
  const v = r.fe[reseau];
  if (Number.isFinite(v)) return v;
  const valeurs = Object.values(r.fe).filter(Number.isFinite);
  return valeurs.length ? Math.min(...valeurs) : r.tn;
}

/** Fil d'eau d'un tuyau à l'abscisse relative u */
export function filDEauTuyau(p: Tuyau, amont: Regard, aval: Regard, u: number): number {
  return lerp(filDEauRegard(amont, p.reseau), filDEauRegard(aval, p.reseau), u);
}

/** Libellé d'un tuyau : réseau et diamètre (« EU Ø200 ») */
export function libelleTuyau(p: Tuyau, reseaux: Reseau[]): string {
  const r = reseaux.find((x) => x.id === p.reseau);
  return `${r ? r.nom : 'Tuyau'} Ø${Math.round(p.diametre * 1000)}`;
}

/** Géométrie verticale d'une coupe : profondeur et hauteur des tuyaux au-dessus du fond */
export interface EtatCoupe {
  H: number;
  /** Hauteur de la génératrice inférieure extérieure de chaque tuyau au-dessus du fond */
  basTuyaux: number[];
}

export function etatCoupe(t: Troncon, amont: Regard, aval: Regard, u: number): EtatCoupe {
  const tn = lerp(amont.tn, aval.tn, u);
  if (t.tuyaux.length === 0) return { H: tn - lerp(filDEauRegard(amont, ''), filDEauRegard(aval, ''), u), basTuyaux: [] };
  const bas = t.tuyaux.map((p) => filDEauTuyau(p, amont, aval, u) - p.paroi);
  const fond = Math.min(...t.tuyaux.map((p, i) => bas[i] - p.enrobage.bas));
  return { H: tn - fond, basTuyaux: bas.map((b) => b - fond) };
}

/** Hauteurs des tuyaux quand tous suivent le même fil d'eau */
export function basTuyauxUniformes(t: Troncon): number[] {
  const calage = calageSousFilDEau(t);
  return t.tuyaux.map((p) => calage - p.paroi);
}

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface GeomTuyau {
  tuyau: Tuyau;
  cx: number;
  cy: number;
  r: number;
  bloc: Rect;
}

export function calageSousFilDEau(t: Troncon): number {
  if (t.tuyaux.length === 0) return 0;
  return Math.max(...t.tuyaux.map((p) => p.paroi + p.enrobage.bas));
}

/** Profondeur de fouille au regard amont (u = 0) ou aval (u = 1) du tronçon */
export function profondeur(t: Troncon, amont: Regard, aval: Regard, u: 0 | 1): number {
  return etatCoupe(t, amont, aval, u).H;
}

function fruitEffectif(t: Troncon): number {
  return t.type === 'V' ? Math.max(0, t.fruit) : 0;
}

/**
 * Largeur de fouille en fond : largeur utile plus le blindage des deux côtés (tranchée
 * en U). Les tuyaux et leurs enrobages restent dans la largeur utile ; la place libérée
 * par le blindage au retrait des panneaux est comblée avec le remblai et la structure.
 */
export function largeurFouille(t: Troncon): number {
  return t.largeur + (t.type === 'U' ? 2 * Math.max(0, t.blindage) : 0);
}

/** Demi-largeur utile de la tranchée à la hauteur y au-dessus du fond */
export function demiLargeur(t: Troncon, y: number): number {
  return t.largeur / 2 + fruitEffectif(t) * y;
}

export function geometrieTuyaux(t: Troncon, basTuyaux: number[] = basTuyauxUniformes(t)): GeomTuyau[] {
  return t.tuyaux.map((p, i) => {
    const r = p.diametre / 2;
    const yBas = basTuyaux[i];
    return {
      tuyau: p,
      cx: p.position,
      cy: yBas + r,
      r,
      bloc: {
        x0: p.position - r - p.enrobage.gauche,
        x1: p.position + r + p.enrobage.droite,
        y0: Math.max(0, yBas - p.enrobage.bas),
        y1: yBas + p.diametre + p.enrobage.haut,
      },
    };
  });
}

/** Longueur de la réunion d'intervalles, rognés à [-a, a] */
function longueurReunion(intervalles: [number, number][], a: number): number {
  const clips = intervalles
    .map(([x0, x1]) => [Math.max(x0, -a), Math.min(x1, a)] as [number, number])
    .filter(([x0, x1]) => x1 > x0)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of clips) {
    if (cur && iv[0] <= cur[1]) {
      cur[1] = Math.max(cur[1], iv[1]);
    } else {
      if (cur) total += cur[1] - cur[0];
      cur = [iv[0], iv[1]];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/**
 * Aire de la réunion des blocs d'enrobage, rognée aux parois de la tranchée
 * et au terrain naturel. Calcul exact : entre deux ordonnées de rupture, la
 * largeur couverte est affine en y, la règle du point milieu est donc exacte.
 */
export function aireReunionBlocs(t: Troncon, blocs: Rect[], H: number): number {
  if (blocs.length === 0 || H <= 0) return 0;
  const f = fruitEffectif(t);
  const yMax = Math.min(H, Math.max(...blocs.map((b) => b.y1)));
  if (yMax <= 0) return 0;
  const ruptures = new Set<number>([0, yMax]);
  for (const b of blocs) {
    if (b.y0 > 0 && b.y0 < yMax) ruptures.add(b.y0);
    if (b.y1 > 0 && b.y1 < yMax) ruptures.add(b.y1);
    if (f > 0) {
      for (const x of [b.x0, b.x1]) {
        const y = (Math.abs(x) - t.largeur / 2) / f;
        if (y > 0 && y < yMax) ruptures.add(y);
      }
    }
  }
  const ys = [...ruptures].sort((a, b) => a - b);
  let aire = 0;
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i];
    const yb = ys[i + 1];
    const ym = (ya + yb) / 2;
    const actifs = blocs.filter((b) => b.y0 <= ym && ym < b.y1).map((b) => [b.x0, b.x1] as [number, number]);
    aire += longueurReunion(actifs, demiLargeur(t, ym)) * (yb - ya);
  }
  return aire;
}

/** Libellé de la nature d'enrobage (vide → « Autre ») */
export function nomMateriau(materiau: string): string {
  return materiau.trim() || 'Autre';
}

/** Natures d'enrobage présentes dans le tronçon, dans l'ordre des tuyaux */
export function materiauxEnrobage(t: Troncon): string[] {
  const liste: string[] = [];
  for (const p of t.tuyaux) {
    const m = nomMateriau(p.enrobage.materiau);
    if (!liste.some((x) => x.toLowerCase() === m.toLowerCase())) liste.push(m);
  }
  return liste;
}

export interface Section {
  H: number;
  /** Aire totale de fouille */
  fouille: number;
  decapage: number;
  /** Fouille hors décapage */
  deblai: number;
  /** Enrobage net (blocs moins tuyaux) */
  enrobage: number;
  /** Enrobage net par nature, dans l'ordre de materiauxEnrobage(t) */
  enrobages: number[];
  tuyaux: number;
  couches: number[];
  remblai: number;
  largeurTete: number;
  /** Bornes des couches de structure, en profondeur sous le TN (après écrêtage) */
  bornesCouches: [number, number][];
  /** Hauteur (depuis le fond) du haut de la zone d'enrobage */
  hautEnrobage: number;
}

/** Aire d'une bande comprise entre les profondeurs z1 et z2 sous le terrain naturel */
function aireBandeHaut(t: Troncon, H: number, z1: number, z2: number): number {
  const f = fruitEffectif(t);
  const a = Math.max(0, Math.min(z1, H));
  const b = Math.max(0, Math.min(z2, H));
  if (b <= a) return 0;
  return (b - a) * (largeurFouille(t) + 2 * f * H) - f * (b * b - a * a);
}

export function section(t: Troncon, Hbrut: number, basTuyaux: number[] = basTuyauxUniformes(t)): Section {
  const H = Math.max(0, Hbrut);
  const f = fruitEffectif(t);
  const fouille = largeurFouille(t) * H + f * H * H;
  const decapage = t.decapage.actif ? aireBandeHaut(t, H, 0, t.decapage.epaisseur) : 0;

  const geoms = geometrieTuyaux(t, basTuyaux);
  const blocs = geoms.map((g) => g.bloc);
  const hautEnrobage = Math.min(H, blocs.length ? Math.max(...blocs.map((b) => b.y1)) : 0);
  const aireBlocs = aireReunionBlocs(t, blocs, H);
  const tuyaux = geoms.reduce((s, g) => s + Math.PI * g.r * g.r, 0);

  // Par nature : la réunion des blocs est attribuée nature par nature, dans l'ordre ; une
  // zone commune à deux natures n'est comptée qu'une fois (pour la première).
  const materiaux = materiauxEnrobage(t);
  const rang = (g: GeomTuyau) => materiaux.findIndex((m) => m.toLowerCase() === nomMateriau(g.tuyau.enrobage.materiau).toLowerCase());
  let cumul = 0;
  const enrobages = materiaux.map((_, k) => {
    const reunion = aireReunionBlocs(t, geoms.filter((g) => rang(g) <= k).map((g) => g.bloc), H);
    const propre = reunion - cumul;
    cumul = reunion;
    const tubes = geoms.filter((g) => rang(g) === k).reduce((a, g) => a + Math.PI * g.r * g.r, 0);
    return Math.max(0, propre - tubes);
  });

  // Les couches de structure s'empilent depuis la surface et s'arrêtent au-dessus de l'enrobage.
  const zLimite = Math.max(0, H - hautEnrobage);
  const bornesCouches: [number, number][] = [];
  let z = 0;
  const couches = t.couches.map((c) => {
    const z1 = Math.min(z, zLimite);
    const z2 = Math.min(z + Math.max(0, c.epaisseur), zLimite);
    z += Math.max(0, c.epaisseur);
    bornesCouches.push([z1, z2]);
    return aireBandeHaut(t, H, z1, z2);
  });
  const totalCouches = couches.reduce((s, v) => s + v, 0);

  return {
    H,
    fouille,
    decapage,
    deblai: fouille - decapage,
    enrobage: Math.max(0, aireBlocs - tuyaux),
    enrobages,
    tuyaux,
    couches,
    remblai: Math.max(0, fouille - aireBlocs - totalCouches),
    largeurTete: largeurFouille(t) + 2 * f * H,
    bornesCouches,
    hautEnrobage,
  };
}

/** Abscisses relatives où le tuyau qui fixe le fond de fouille peut changer */
function ruptures(t: Troncon, amont: Regard, aval: Regard): number[] {
  const cote = (p: Tuyau, u: number) => filDEauTuyau(p, amont, aval, u) - p.paroi - p.enrobage.bas;
  const us = [0, 1];
  for (let i = 0; i < t.tuyaux.length; i++) {
    for (let j = i + 1; j < t.tuyaux.length; j++) {
      const d0 = cote(t.tuyaux[i], 0) - cote(t.tuyaux[j], 0);
      const d1 = cote(t.tuyaux[i], 1) - cote(t.tuyaux[j], 1);
      if (d0 * d1 < 0) us.push(d0 / (d0 - d1));
    }
  }
  return [...new Set(us)].sort((a, b) => a - b);
}

type Grandeurs = Pick<Section, 'H' | 'fouille' | 'decapage' | 'deblai' | 'enrobage' | 'enrobages' | 'tuyaux' | 'remblai' | 'largeurTete' | 'couches'>;
const CHAMPS = ['H', 'fouille', 'decapage', 'deblai', 'enrobage', 'tuyaux', 'remblai', 'largeurTete'] as const;

/** Moyennes des grandeurs de section le long du tronçon (Simpson par morceaux) */
function moyennesLongueur(t: Troncon, amont: Regard, aval: Regard): Grandeurs {
  const m: Grandeurs = {
    H: 0,
    fouille: 0,
    decapage: 0,
    deblai: 0,
    enrobage: 0,
    enrobages: materiauxEnrobage(t).map(() => 0),
    tuyaux: 0,
    remblai: 0,
    largeurTete: 0,
    couches: t.couches.map(() => 0),
  };
  const us = ruptures(t, amont, aval);
  const n = SIMPSON_INTERVALLES;
  for (let k = 0; k + 1 < us.length; k++) {
    const [ua, ub] = [us[k], us[k + 1]];
    for (let i = 0; i <= n; i++) {
      const w = ((i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2) * (ub - ua)) / (3 * n);
      const e = etatCoupe(t, amont, aval, lerp(ua, ub, i / n));
      const sec = section(t, e.H, e.basTuyaux);
      for (const c of CHAMPS) m[c] += w * sec[c];
      sec.couches.forEach((v, j) => (m.couches[j] += w * v));
      sec.enrobages.forEach((v, j) => (m.enrobages[j] += w * v));
    }
  }
  return m;
}

export interface VolumeExtrait {
  enPlace: number;
  /** Volume après foisonnement éventuel */
  compte: number;
  reutilise: boolean;
}

export interface ResultatTroncon {
  index: number;
  amont: string;
  aval: string;
  longueur: number;
  H1: number;
  H2: number;
  type: Troncon['type'];
  surface: SurfaceNature;
  fouille: number;
  decapage: number;
  deblai: number;
  enrobage: number;
  /** Enrobage par nature (sable, gravier, béton…) */
  enrobages: { nom: string; volume: number }[];
  tuyaux: number;
  couches: { nom: string; volume: number }[];
  remblai: number;
  surfaceTete: number;
  surfaceBlindage: number;
  extraitDeblai: VolumeExtrait;
  extraitDecapage: VolumeExtrait;
  /** Volumes extraits comptés en remblai réemployé */
  reemploi: number;
  /** Idem, en place (avant foisonnement) */
  reemploiEnPlace: number;
  /** Volumes extraits comptés en évacuation */
  evacuation: number;
  /** Remblai à fournir : besoin en remblai moins le réemploi (volumes en place) */
  apport: number;
  canalisations: Canalisation[];
  alertes: string[];
}

/** Linéaire de canalisation d'un réseau pour un diamètre */
export interface Canalisation {
  reseau: string;
  nom: string;
  couleur: string;
  diametre: number;
  longueur: number;
}

function extrait(enPlace: number, o: OptionsMateriau): VolumeExtrait {
  return {
    enPlace,
    compte: o.foisonnement ? enPlace * o.coefficient : enPlace,
    reutilise: o.reutilise,
  };
}

export function alertesTroncon(
  t: Troncon,
  amont: Regard,
  aval: Regard,
  nom: (p: Tuyau) => string = (p) => `Ø${Math.round(p.diametre * 1000)}`,
): string[] {
  const alertes = new Set<string>();
  if (t.longueur <= 0) alertes.add('Longueur du tronçon nulle ou négative.');
  if (t.largeur <= 0) alertes.add('Largeur de tranchée nulle ou négative.');
  const demi = t.largeur / 2;
  const epStructure = t.couches.reduce((s, c) => s + Math.max(0, c.epaisseur), 0);

  // Les positions verticales étant affines le long du tronçon, on contrôle aux deux regards.
  for (const u of [0, 1] as const) {
    const regard = u === 0 ? 'amont' : 'aval';
    const { H, basTuyaux } = etatCoupe(t, amont, aval, u);
    if (H <= 0) alertes.add(`Profondeur nulle ou négative au regard ${regard} (vérifier TN / fil d’eau).`);
    const geoms = geometrieTuyaux(t, basTuyaux);
    for (const g of geoms) {
      if (g.bloc.x0 < -demi - 1e-9 || g.bloc.x1 > demi + 1e-9) {
        alertes.add(`L’enrobage de « ${nom(g.tuyau)} » dépasse la largeur en fond de tranchée : il est rogné aux parois.`);
      }
      if (g.cy + g.r > H + 1e-9) alertes.add(`« ${nom(g.tuyau)} » dépasse le terrain naturel au regard ${regard}.`);
    }
    for (let i = 0; i < geoms.length; i++) {
      for (let j = i + 1; j < geoms.length; j++) {
        const a = geoms[i];
        const b = geoms[j];
        if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - 1e-9) {
          alertes.add(`Les tuyaux « ${nom(a.tuyau)} » et « ${nom(b.tuyau)} » se chevauchent au regard ${regard}.`);
        } else if (
          a.bloc.x0 < b.bloc.x1 - 1e-9 &&
          b.bloc.x0 < a.bloc.x1 - 1e-9 &&
          a.bloc.y0 < b.bloc.y1 - 1e-9 &&
          b.bloc.y0 < a.bloc.y1 - 1e-9
        ) {
          alertes.add(`Les enrobages de « ${nom(a.tuyau)} » et « ${nom(b.tuyau)} » se recouvrent : la partie commune n’est comptée qu’une fois.`);
        }
      }
    }
    const hautEnrobage = geoms.length ? Math.max(...geoms.map((g) => g.bloc.y1)) : 0;
    if (H > 0 && epStructure > H - hautEnrobage + 1e-9) {
      alertes.add(`La structure empiète sur l’enrobage au regard ${regard} : les couches sont écrêtées.`);
    }
    if (t.decapage.actif && H > 0 && t.decapage.epaisseur > H) {
      alertes.add(`Le décapage est plus épais que la fouille au regard ${regard}.`);
    }
  }
  return [...alertes];
}

export function calculTroncon(p: Projet, index: number): ResultatTroncon {
  const t = p.troncons[index];
  const ra = p.regards[index];
  const rb = p.regards[index + 1];
  const H1 = profondeur(t, ra, rb, 0);
  const H2 = profondeur(t, ra, rb, 1);
  const L = Math.max(0, t.longueur);
  const m = moyennesLongueur(t, ra, rb);

  const decapage = L * m.decapage;
  const deblai = L * m.deblai;
  const remblai = L * m.remblai;
  const extraitDeblai = extrait(deblai, t.optionsDeblai);
  const extraitDecapage = extrait(decapage, t.optionsDecapage);
  const extraits = [extraitDeblai, extraitDecapage];
  const reemployeEnPlace = extraits.filter((e) => e.reutilise).reduce((s, e) => s + e.enPlace, 0);

  return {
    index,
    amont: ra.nom,
    aval: rb.nom,
    longueur: L,
    H1,
    H2,
    type: t.type,
    surface: t.surface,
    fouille: L * m.fouille,
    decapage,
    deblai,
    enrobage: L * m.enrobage,
    enrobages: materiauxEnrobage(t).map((nom, i) => ({ nom, volume: L * m.enrobages[i] })),
    tuyaux: L * m.tuyaux,
    couches: t.couches.map((c, i) => ({ nom: c.nom, volume: L * m.couches[i] })),
    remblai,
    surfaceTete: L * m.largeurTete,
    surfaceBlindage: t.type === 'U' ? 2 * L * Math.max(0, m.H) : 0,
    extraitDeblai,
    extraitDecapage,
    reemploi: extraits.filter((e) => e.reutilise).reduce((s, e) => s + e.compte, 0),
    reemploiEnPlace: reemployeEnPlace,
    evacuation: extraits.filter((e) => !e.reutilise).reduce((s, e) => s + e.compte, 0),
    apport: Math.max(0, remblai - reemployeEnPlace),
    canalisations: t.tuyaux.map((x) => {
      const r = p.reseaux.find((y) => y.id === x.reseau);
      return { reseau: x.reseau, nom: r?.nom ?? '?', couleur: r?.couleur ?? '#888', diametre: x.diametre, longueur: L };
    }),
    alertes: alertesTroncon(t, ra, rb, (x) => libelleTuyau(x, p.reseaux)),
  };
}

export interface ResultatGlobal {
  longueur: number;
  fouille: number;
  decapageTerre: number;
  decapageEnrobe: number;
  deblai: number;
  enrobage: number;
  enrobages: { nom: string; volume: number }[];
  tuyaux: number;
  couches: { nom: string; volume: number }[];
  remblai: number;
  surfaceTete: number;
  surfaceBlindage: number;
  reemploi: number;
  evacuation: number;
  /** Linéaire par réseau et diamètre */
  canalisations: Canalisation[];
  /** Remblai à fournir à l'échelle du chantier (les excédents d'un tronçon compensent les autres) */
  apport: number;
}

export function calculGlobal(resultats: ResultatTroncon[]): ResultatGlobal {
  const somme = (g: (r: ResultatTroncon) => number) => resultats.reduce((s, r) => s + g(r), 0);
  /** Regroupe des volumes par nom, sans tenir compte de la casse */
  const regrouper = (listes: { nom: string; volume: number }[][]) => {
    const m = new Map<string, { nom: string; volume: number }>();
    for (const c of listes.flat()) {
      const cle = c.nom.trim().toLowerCase();
      const cur = m.get(cle);
      if (cur) cur.volume += c.volume;
      else m.set(cle, { nom: c.nom.trim(), volume: c.volume });
    }
    return [...m.values()];
  };
  const couches = regrouper(resultats.map((r) => r.couches));
  const canalisations: Canalisation[] = [];
  for (const r of resultats) {
    for (const c of r.canalisations) {
      const cur = canalisations.find((x) => x.reseau === c.reseau && Math.abs(x.diametre - c.diametre) < 1e-9);
      if (cur) cur.longueur += c.longueur;
      else canalisations.push({ ...c });
    }
  }
  return {
    canalisations,
    longueur: somme((r) => r.longueur),
    fouille: somme((r) => r.fouille),
    decapageTerre: somme((r) => (r.surface === 'terre' ? r.decapage : 0)),
    decapageEnrobe: somme((r) => (r.surface === 'enrobe' ? r.decapage : 0)),
    deblai: somme((r) => r.deblai),
    enrobage: somme((r) => r.enrobage),
    enrobages: regrouper(resultats.map((r) => r.enrobages)),
    tuyaux: somme((r) => r.tuyaux),
    couches,
    remblai: somme((r) => r.remblai),
    surfaceTete: somme((r) => r.surfaceTete),
    surfaceBlindage: somme((r) => r.surfaceBlindage),
    reemploi: somme((r) => r.reemploi),
    evacuation: somme((r) => r.evacuation),
    apport: Math.max(0, somme((r) => r.remblai) - somme((r) => r.reemploiEnPlace)),
  };
}

export function calculProjet(p: Projet): { troncons: ResultatTroncon[]; global: ResultatGlobal } {
  const troncons = p.troncons.map((_, i) => calculTroncon(p, i));
  return { troncons, global: calculGlobal(troncons) };
}
