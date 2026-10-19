import type { OptionsMateriau, Projet, Regard, SurfaceNature, Troncon, Tuyau } from './types';

/*
 * Repère de la coupe transversale : x horizontal, 0 sur l'axe de la tranchée ;
 * y vertical, 0 au fond de fouille, positif vers le haut. H est la profondeur
 * totale de fouille (du terrain naturel au fond de fouille).
 *
 * Profondeur de fouille à un regard = TN − FE + calage sous fil d'eau, où le
 * calage est la plus grande valeur (épaisseur de paroi + enrobage bas) parmi les
 * tuyaux du tronçon. Tous les tuyaux d'un tronçon partagent le même fil d'eau.
 *
 * Entre deux regards, H varie linéairement. Les aires de section sont des
 * polynômes de degré ≤ 2 en H (hors cas d'écrêtage) : l'intégration de Simpson
 * le long du tronçon donne donc le volume exact.
 */

const SIMPSON_INTERVALLES = 20;

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

export function profondeur(r: Regard, t: Troncon): number {
  return r.tn - r.fe + calageSousFilDEau(t);
}

function fruitEffectif(t: Troncon): number {
  return t.type === 'V' ? Math.max(0, t.fruit) : 0;
}

/** Demi-largeur de la tranchée à la hauteur y au-dessus du fond */
export function demiLargeur(t: Troncon, y: number): number {
  return t.largeur / 2 + fruitEffectif(t) * y;
}

export function geometrieTuyaux(t: Troncon): GeomTuyau[] {
  const calage = calageSousFilDEau(t);
  return t.tuyaux.map((p) => {
    const r = p.diametre / 2;
    const yBas = calage - p.paroi;
    return {
      tuyau: p,
      cx: p.position,
      cy: yBas + r,
      r,
      bloc: {
        x0: p.position - r - p.enrobage.gauche,
        x1: p.position + r + p.enrobage.droite,
        y0: 0,
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

export interface Section {
  H: number;
  /** Aire totale de fouille */
  fouille: number;
  decapage: number;
  /** Fouille hors décapage */
  deblai: number;
  /** Enrobage net (blocs moins tuyaux) */
  enrobage: number;
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
  return (b - a) * (t.largeur + 2 * f * H) - f * (b * b - a * a);
}

export function section(t: Troncon, Hbrut: number): Section {
  const H = Math.max(0, Hbrut);
  const f = fruitEffectif(t);
  const fouille = t.largeur * H + f * H * H;
  const decapage = t.decapage.actif ? aireBandeHaut(t, H, 0, t.decapage.epaisseur) : 0;

  const geoms = geometrieTuyaux(t);
  const blocs = geoms.map((g) => g.bloc);
  const hautEnrobage = Math.min(H, blocs.length ? Math.max(...blocs.map((b) => b.y1)) : 0);
  const aireBlocs = aireReunionBlocs(t, blocs, H);
  const tuyaux = geoms.reduce((s, g) => s + Math.PI * g.r * g.r, 0);

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
    tuyaux,
    couches,
    remblai: Math.max(0, fouille - aireBlocs - totalCouches),
    largeurTete: t.largeur + 2 * f * H,
    bornesCouches,
    hautEnrobage,
  };
}

/** Moyenne d'une grandeur de section le long du tronçon (Simpson) */
function moyenneLongueur(H1: number, H2: number, g: (H: number) => number): number {
  const n = SIMPSON_INTERVALLES;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    s += w * g(H1 + ((H2 - H1) * i) / n);
  }
  return s / (3 * n);
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
  alertes: string[];
}

function extrait(enPlace: number, o: OptionsMateriau): VolumeExtrait {
  return {
    enPlace,
    compte: o.foisonnement ? enPlace * o.coefficient : enPlace,
    reutilise: o.reutilise,
  };
}

export function alertesTroncon(t: Troncon, H1: number, H2: number): string[] {
  const alertes: string[] = [];
  const Hmin = Math.min(H1, H2);
  if (t.longueur <= 0) alertes.push('Longueur du tronçon nulle ou négative.');
  if (t.largeur <= 0) alertes.push('Largeur de tranchée nulle ou négative.');
  if (Hmin <= 0) alertes.push('Profondeur nulle ou négative à un regard (vérifier TN / fil d’eau).');

  const geoms = geometrieTuyaux(t);
  const demi = t.largeur / 2;
  for (const g of geoms) {
    if (g.bloc.x0 < -demi - 1e-9 || g.bloc.x1 > demi + 1e-9) {
      alertes.push(`L’enrobage de « ${g.tuyau.nom} » dépasse la largeur en fond de tranchée : il est rogné aux parois.`);
    }
    if (g.cy + g.r > Hmin + 1e-9) {
      alertes.push(`« ${g.tuyau.nom} » dépasse le terrain naturel à un regard.`);
    }
  }
  for (let i = 0; i < geoms.length; i++) {
    for (let j = i + 1; j < geoms.length; j++) {
      const a = geoms[i];
      const b = geoms[j];
      if (Math.abs(a.cx - b.cx) < a.r + b.r - 1e-9) {
        alertes.push(`Les tuyaux « ${a.tuyau.nom} » et « ${b.tuyau.nom} » se chevauchent.`);
      } else if (a.bloc.x0 < b.bloc.x1 - 1e-9 && b.bloc.x0 < a.bloc.x1 - 1e-9) {
        alertes.push(
          `Les enrobages de « ${a.tuyau.nom} » et « ${b.tuyau.nom} » se recouvrent : la partie commune n’est comptée qu’une fois.`,
        );
      }
    }
  }
  const epStructure = t.couches.reduce((s, c) => s + Math.max(0, c.epaisseur), 0);
  const hautEnrobage = geoms.length ? Math.max(...geoms.map((g) => g.bloc.y1)) : 0;
  if (Hmin > 0 && epStructure > Hmin - hautEnrobage + 1e-9) {
    alertes.push('La structure empiète sur l’enrobage à un regard : les couches sont écrêtées.');
  }
  if (t.decapage.actif && Hmin > 0 && t.decapage.epaisseur > Hmin) {
    alertes.push('Le décapage est plus épais que la fouille à un regard.');
  }
  return alertes;
}

export function calculTroncon(p: Projet, index: number): ResultatTroncon {
  const t = p.troncons[index];
  const ra = p.regards[index];
  const rb = p.regards[index + 1];
  const H1 = profondeur(ra, t);
  const H2 = profondeur(rb, t);
  const L = Math.max(0, t.longueur);
  const vol = (g: (s: Section) => number) => L * moyenneLongueur(H1, H2, (H) => g(section(t, H)));

  const decapage = vol((s) => s.decapage);
  const deblai = vol((s) => s.deblai);
  const remblai = vol((s) => s.remblai);
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
    fouille: vol((s) => s.fouille),
    decapage,
    deblai,
    enrobage: vol((s) => s.enrobage),
    tuyaux: vol((s) => s.tuyaux),
    couches: t.couches.map((c, i) => ({ nom: c.nom, volume: vol((s) => s.couches[i]) })),
    remblai,
    surfaceTete: vol((s) => s.largeurTete),
    surfaceBlindage: t.type === 'U' ? 2 * L * ((Math.max(0, H1) + Math.max(0, H2)) / 2) : 0,
    extraitDeblai,
    extraitDecapage,
    reemploi: extraits.filter((e) => e.reutilise).reduce((s, e) => s + e.compte, 0),
    reemploiEnPlace: reemployeEnPlace,
    evacuation: extraits.filter((e) => !e.reutilise).reduce((s, e) => s + e.compte, 0),
    apport: Math.max(0, remblai - reemployeEnPlace),
    alertes: alertesTroncon(t, H1, H2),
  };
}

export interface ResultatGlobal {
  longueur: number;
  fouille: number;
  decapageTerre: number;
  decapageEnrobe: number;
  deblai: number;
  enrobage: number;
  tuyaux: number;
  couches: { nom: string; volume: number }[];
  remblai: number;
  surfaceTete: number;
  surfaceBlindage: number;
  reemploi: number;
  evacuation: number;
  /** Remblai à fournir à l'échelle du chantier (les excédents d'un tronçon compensent les autres) */
  apport: number;
}

export function calculGlobal(resultats: ResultatTroncon[]): ResultatGlobal {
  const somme = (g: (r: ResultatTroncon) => number) => resultats.reduce((s, r) => s + g(r), 0);
  const couches = new Map<string, { nom: string; volume: number }>();
  for (const r of resultats) {
    for (const c of r.couches) {
      const cle = c.nom.trim().toLowerCase();
      const cur = couches.get(cle);
      if (cur) cur.volume += c.volume;
      else couches.set(cle, { nom: c.nom.trim(), volume: c.volume });
    }
  }
  return {
    longueur: somme((r) => r.longueur),
    fouille: somme((r) => r.fouille),
    decapageTerre: somme((r) => (r.surface === 'terre' ? r.decapage : 0)),
    decapageEnrobe: somme((r) => (r.surface === 'enrobe' ? r.decapage : 0)),
    deblai: somme((r) => r.deblai),
    enrobage: somme((r) => r.enrobage),
    tuyaux: somme((r) => r.tuyaux),
    couches: [...couches.values()],
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
