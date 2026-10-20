import type { Couche, Enrobage, OptionsMateriau, Projet, Regard, Reseau, Troncon, Tuyau } from './types';

let compteur = 0;
export function nouvelId(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${Date.now().toString(36)}-${compteur.toString(36)}`;
}

const optionsDeblaiDefaut: OptionsMateriau = { reutilise: false, foisonnement: true, coefficient: 1.25 };
const optionsDecapageDefaut: OptionsMateriau = { reutilise: false, foisonnement: true, coefficient: 1.25 };

/** Couleurs proposées pour les réseaux, lisibles sur fond clair comme sombre */
export const COULEURS_RESEAUX = ['#a8652f', '#2f80c4', '#2e9467', '#c2463a', '#c99a14', '#8a55b5'];

/** Couleur usuelle selon le nom du réseau, sinon la première couleur libre */
export function couleurPour(nom: string, prises: string[]): string {
  const usuelles: Record<string, string> = { EU: '#a8652f', EP: '#2f80c4', AEP: '#2e9467', UN: '#8a55b5' };
  const u = usuelles[nom.trim().toUpperCase()];
  if (u && !prises.includes(u)) return u;
  return COULEURS_RESEAUX.find((c) => !prises.includes(c)) ?? COULEURS_RESEAUX[prises.length % COULEURS_RESEAUX.length];
}

/** Enrobage proposé pour un nouveau réseau */
export const ENROBAGE_DEFAUT: Enrobage = { materiau: 'Sable', bas: 0.1, haut: 0.15, gauche: 0.15, droite: 0.15 };

/** Natures d'enrobage proposées ; « Autre » permet un libellé libre */
export const MATERIAUX_ENROBAGE = ['Sable', 'Gravier', 'Béton'];

/** Suffixe de classe CSS d'une nature d'enrobage (couleur sur la coupe) */
export function classeMateriau(materiau: string): 'sable' | 'gravier' | 'beton' | 'autre' {
  const m = materiau.trim().toLowerCase();
  if (m === 'sable') return 'sable';
  if (m === 'gravier') return 'gravier';
  if (m === 'béton' || m === 'beton') return 'beton';
  return 'autre';
}

export function nouveauReseau(nom: string, couleur: string, enrobage: Enrobage = ENROBAGE_DEFAUT): Reseau {
  return { id: nouvelId('reseau'), nom, couleur, enrobage: { ...enrobage } };
}

export function nouveauTuyau(reseau: string, diametre = 0.315, position = 0, enrobage: Enrobage = ENROBAGE_DEFAUT): Tuyau {
  return {
    id: nouvelId('tuyau'),
    reseau,
    diametre,
    paroi: 0,
    position,
    enrobage: { ...enrobage },
  };
}

export function nouvelleCouche(nom = 'Grave 0/31.5', epaisseur = 0.3): Couche {
  return { id: nouvelId('couche'), nom, epaisseur };
}

export function nouveauTroncon(longueur: number, reseau: string): Troncon {
  return {
    id: nouvelId('troncon'),
    longueur,
    commePrecedent: false,
    type: 'U',
    largeur: 0.8,
    largeurAuto: true,
    blindage: 0,
    fruit: 0.5,
    surface: 'enrobe',
    decapage: { actif: true, epaisseur: 0.08 },
    recoupe: { actif: false, largeur: 0.1 },
    tuyaux: [nouveauTuyau(reseau)],
    couches: [nouvelleCouche('Enrobé BB 0/10', 0.06), nouvelleCouche('Grave-bitume', 0.12), nouvelleCouche('Grave 0/31.5', 0.3)],
    remblaiNom: 'Remblai de tranchée',
    optionsDeblai: { ...optionsDeblaiDefaut },
    optionsDecapage: { ...optionsDecapageDefaut },
  };
}

/** Copie profonde d'un tronçon avec de nouveaux identifiants */
export function dupliquerTroncon(t: Troncon, longueur = t.longueur): Troncon {
  return {
    ...structuredClone(t),
    id: nouvelId('troncon'),
    longueur,
    tuyaux: t.tuyaux.map((p) => ({ ...structuredClone(p), id: nouvelId('tuyau') })),
    couches: t.couches.map((c) => ({ ...c, id: nouvelId('couche') })),
  };
}

export function nouveauRegard(nom: string, tn: number, fe: Record<string, number>): Regard {
  return { id: nouvelId('regard'), nom, tn, fe };
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Tuyaux rangés de gauche à droite */
export function tuyauxGaucheDroite(tuyaux: Tuyau[]): Tuyau[] {
  return [...tuyaux].sort((a, b) => a.position - b.position);
}

/** Écart nu à nu (paroi à paroi) entre chaque tuyau et son voisin de gauche ; 0 pour le premier */
export function ecartsTuyaux(tries: Tuyau[]): number[] {
  return tries.map((x, i) => (i === 0 ? 0 : x.position - x.diametre / 2 - (tries[i - 1].position + tries[i - 1].diametre / 2)));
}

/** Écart par défaut entre deux tuyaux voisins : leurs enrobages se touchent */
export function ecartJointif(a: Tuyau, b: Tuyau): number {
  return a.enrobage.droite + b.enrobage.gauche;
}

/** Replace des tuyaux rangés de gauche à droite selon les écarts, paroi gauche du premier en x0 */
function replacer(tries: Tuyau[], ecarts: number[], x0: number): Tuyau[] {
  let x = x0;
  return tries.map((p, i) => {
    if (i > 0) x += ecarts[i];
    const position = mm(x + p.diametre / 2);
    x += p.diametre;
    return { ...p, position };
  });
}

/** Emprise latérale des enrobages : [bord gauche, bord droit] */
function emprise(tuyaux: Tuyau[]): [number, number] {
  return [
    Math.min(...tuyaux.map((p) => p.position - p.diametre / 2 - p.enrobage.gauche)),
    Math.max(...tuyaux.map((p) => p.position + p.diametre / 2 + p.enrobage.droite)),
  ];
}

const versCmSuperieur = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;

/**
 * Recentre les tuyaux dans la tranchée. Largeur exacte : la largeur utile devient
 * l'emprise des enrobages ; sinon elle n'est qu'élargie si les enrobages en sortent.
 */
function recentrer(t: Troncon, exacte: boolean): Troncon {
  if (t.tuyaux.length === 0) return t;
  const [a, b] = emprise(t.tuyaux);
  const dx = -(a + b) / 2;
  const besoin = versCmSuperieur(b - a);
  return {
    ...t,
    largeur: exacte ? besoin : Math.max(t.largeur, besoin),
    tuyaux: t.tuyaux.map((p) => ({ ...p, position: mm(p.position + dx) })),
  };
}

/** En largeur automatique, recentre les tuyaux et ajuste la largeur à leur emprise */
export function ajusterLargeur(t: Troncon): Troncon {
  if (!t.largeurAuto || t.tuyaux.length === 0) return t;
  const r = recentrer(t, true);
  const inchange = Math.abs(r.largeur - t.largeur) < 1e-9 && r.tuyaux.every((p, i) => Math.abs(p.position - t.tuyaux[i].position) < 1e-9);
  return inchange ? t : r;
}

/**
 * Place les tuyaux côte à côte, enrobages jointifs, le groupe étant centré.
 * Renvoie aussi la largeur minimale de tranchée correspondante.
 */
export function repartirTuyaux(tuyaux: Tuyau[]): { tuyaux: Tuyau[]; largeur: number } {
  if (tuyaux.length === 0) return { tuyaux, largeur: 0 };
  const ecarts = tuyaux.map((x, i) => (i === 0 ? 0 : ecartJointif(tuyaux[i - 1], x)));
  const places = replacer(tuyaux, ecarts, 0);
  const [a, b] = emprise(places);
  return { tuyaux: places.map((p) => ({ ...p, position: mm(p.position - (a + b) / 2) })), largeur: versCmSuperieur(b - a) };
}

/** Exemple de départ : double réseau EU + EP sur deux tronçons, EU seul sur le troisième */
export function projetExemple(): Projet {
  const eu = nouveauReseau('EU', '#a8652f');
  const ep = nouveauReseau('EP', '#2f80c4', { ...ENROBAGE_DEFAUT, materiau: 'Gravier' });
  const r = (nom: string, tn: number, feEu: number, feEp: number) => nouveauRegard(nom, tn, { [eu.id]: feEu, [ep.id]: feEp });
  const regards = [r('R1', 102.4, 100.8, 101.05), r('R2', 102.1, 100.55, 100.8), r('R3', 101.6, 100.3, 100.55), r('R4', 101.5, 100.05, 100.3)];

  const double = (longueur: number) => {
    const t = nouveauTroncon(longueur, eu.id);
    const { tuyaux, largeur } = repartirTuyaux([nouveauTuyau(eu.id, 0.2, 0, eu.enrobage), nouveauTuyau(ep.id, 0.4, 0, ep.enrobage)]);
    t.tuyaux = tuyaux;
    t.largeur = largeur;
    t.blindage = 0.05;
    return t;
  };
  const t1 = double(35);
  const t2 = double(42.5);
  const t3 = nouveauTroncon(28, eu.id);
  t3.tuyaux = [nouveauTuyau(eu.id, 0.2, 0, eu.enrobage)];
  t3.type = 'V';
  t3.largeur = 0.6;
  t3.surface = 'terre';
  t3.decapage = { actif: true, epaisseur: 0.2 };
  t3.couches = [];
  t3.optionsDeblai.reutilise = true;
  t3.optionsDecapage.reutilise = true;
  return { nom: 'Nouveau projet', saisie: 'altitudes', reseaux: [eu, ep], regards, troncons: [t1, t2, t3] };
}

/** Diamètre proposé pour un réseau : celui de son dernier tuyau dans le projet, sinon 200 mm */
export function diametreParDefaut(p: Projet, reseau: string): number {
  for (let i = p.troncons.length - 1; i >= 0; i--) {
    const x = p.troncons[i].tuyaux.find((q) => q.reseau === reseau);
    if (x) return x.diametre;
  }
  return 0.2;
}

/**
 * Pose un tuyau du réseau dans le tronçon, à sa place dans l'ordre des réseaux, avec des
 * enrobages jointifs de part et d'autre ; les écarts existants sont conservés.
 */
export function poserReseau(t: Troncon, reseau: Reseau, diametre: number, ordre: string[]): Troncon {
  if (t.tuyaux.some((x) => x.reseau === reseau.id)) return t;
  const tries = tuyauxGaucheDroite(t.tuyaux);
  const modele = tries[tries.length - 1];
  const nouveau = nouveauTuyau(reseau.id, diametre, 0, reseau.enrobage);
  if (modele) nouveau.paroi = modele.paroi;
  if (tries.length === 0) return recentrer({ ...t, tuyaux: [nouveau] }, t.largeurAuto);
  const rang = (x: Tuyau) => ordre.indexOf(x.reseau);
  let k = tries.findIndex((x) => rang(x) > rang(nouveau));
  if (k < 0) k = tries.length;
  const ecarts = ecartsTuyaux(tries);
  const x0 = tries[0].position - tries[0].diametre / 2;
  tries.splice(k, 0, nouveau);
  ecarts.splice(k, 0, k > 0 ? ecartJointif(tries[k - 1], nouveau) : 0);
  if (k + 1 < tries.length) ecarts[k + 1] = ecartJointif(nouveau, tries[k + 1]);
  ecarts[0] = 0;
  return recentrer({ ...t, tuyaux: replacer(tries, ecarts, x0) }, t.largeurAuto);
}

/** Change le diamètre des tuyaux d'un réseau en conservant les écarts nu à nu */
export function changerDiametre(t: Troncon, reseau: string, diametre: number): Troncon {
  const tries = tuyauxGaucheDroite(t.tuyaux);
  if (tries.length === 0) return t;
  const ecarts = ecartsTuyaux(tries);
  const x0 = tries[0].position - tries[0].diametre / 2;
  const modifies = tries.map((x) => (x.reseau === reseau ? { ...x, diametre } : x));
  return recentrer({ ...t, tuyaux: replacer(modifies, ecarts, x0) }, t.largeurAuto);
}

/** Fixe l'écart nu à nu entre un tuyau et son voisin de gauche ; les tuyaux à droite suivent */
export function changerEcart(t: Troncon, id: string, ecart: number): Troncon {
  const tries = tuyauxGaucheDroite(t.tuyaux);
  const k = tries.findIndex((x) => x.id === id);
  if (k <= 0) return t;
  const ecarts = ecartsTuyaux(tries);
  ecarts[k] = ecart;
  return recentrer({ ...t, tuyaux: replacer(tries, ecarts, tries[0].position - tries[0].diametre / 2) }, t.largeurAuto);
}

/** Retire les tuyaux du réseau du tronçon ; les autres gardent leurs écarts */
export function retirerReseauTroncon(t: Troncon, reseau: string): Troncon {
  const reste = t.tuyaux.filter((x) => x.reseau !== reseau);
  if (reste.length === t.tuyaux.length) return t;
  return recentrer({ ...t, tuyaux: reste }, t.largeurAuto);
}

/** Recopie la tranchée type (hors tuyaux et longueur) d'un tronçon sur un autre */
function copierTranchee(modele: Troncon, t: Troncon): Troncon {
  return ajusterLargeur({
    ...t,
    type: modele.type,
    largeur: modele.largeur,
    largeurAuto: modele.largeurAuto,
    blindage: modele.blindage,
    fruit: modele.fruit,
    surface: modele.surface,
    decapage: { ...modele.decapage },
    recoupe: { ...modele.recoupe },
    couches: modele.couches.map((c) => ({ ...c })),
    remblaiNom: modele.remblaiNom,
    optionsDeblai: { ...modele.optionsDeblai },
    optionsDecapage: { ...modele.optionsDecapage },
  });
}

/**
 * Applique « même tranchée que le précédent » de proche en proche, de l'amont vers
 * l'aval : une chaîne de tronçons cochés reprend la tranchée du premier non coché.
 */
export function propagerTranchees(p: Projet): Projet {
  let change = false;
  const troncons = [...p.troncons];
  for (let i = 1; i < troncons.length; i++) {
    if (!troncons[i].commePrecedent) continue;
    const copie = copierTranchee(troncons[i - 1], troncons[i]);
    if (JSON.stringify(copie) !== JSON.stringify(troncons[i])) {
      troncons[i] = copie;
      change = true;
    }
  }
  return change ? { ...p, troncons } : p;
}

/** Ce que l'on recopie d'un tronçon vers d'autres */
export interface OptionsDuplication {
  /** Tuyaux : réseaux, diamètres, écarts et enrobages (sinon les tuyaux de la cible sont gardés) */
  tuyaux: boolean;
}

/**
 * Recopie la tranchée d'un tronçon (type, largeur, blindage, talus, surface, décapage,
 * structure, remblai, options des matériaux et, au choix, les tuyaux) vers d'autres
 * tronçons. La longueur de chaque cible est conservée.
 */
export function dupliquerVers(p: Projet, source: number, cibles: number[], options: OptionsDuplication): Projet {
  const modele = p.troncons[source];
  return {
    ...p,
    troncons: p.troncons.map((t, i) => {
      if (i === source || !cibles.includes(i)) return t;
      const copie = { ...dupliquerTroncon(modele, t.longueur), id: t.id, commePrecedent: false };
      if (!options.tuyaux) copie.tuyaux = t.tuyaux;
      return ajusterLargeur(copie);
    }),
  };
}

/**
 * Met à jour un réseau. Son enrobage est recopié sur tous ses tuyaux, dans tous les
 * tronçons ; les écarts nu à nu sont conservés et les largeurs automatiques suivent.
 */
export function majReseau(p: Projet, r: Reseau): Projet {
  const avant = p.reseaux.find((x) => x.id === r.id);
  const reseaux = p.reseaux.map((x) => (x.id === r.id ? r : x));
  const e = r.enrobage;
  const a = avant?.enrobage;
  if (a && a.materiau === e.materiau && a.bas === e.bas && a.haut === e.haut && a.gauche === e.gauche && a.droite === e.droite) {
    return { ...p, reseaux };
  }
  return {
    ...p,
    reseaux,
    troncons: p.troncons.map((t) =>
      t.tuyaux.some((x) => x.reseau === r.id)
        ? ajusterLargeur({ ...t, tuyaux: t.tuyaux.map((x) => (x.reseau === r.id ? { ...x, enrobage: { ...e } } : x)) })
        : t,
    ),
  };
}

/** Ajoute un réseau ; son fil d'eau aux regards part de celui du premier réseau, relevé de 30 cm */
export function ajouterReseau(p: Projet): Projet {
  const nom = `Réseau ${p.reseaux.length + 1}`;
  const r = nouveauReseau(nom, couleurPour(nom, p.reseaux.map((x) => x.couleur)), p.reseaux[0]?.enrobage);
  const ref = p.reseaux[0].id;
  return {
    ...p,
    reseaux: [...p.reseaux, r],
    regards: p.regards.map((g) => ({ ...g, fe: { ...g.fe, [r.id]: Math.round(((g.fe[ref] ?? g.tn - 1.5) + 0.3) * 100) / 100 } })),
  };
}

/** Supprime un réseau et ses tuyaux dans tous les tronçons (le dernier réseau est conservé) */
export function supprimerReseau(p: Projet, id: string): Projet {
  if (p.reseaux.length <= 1) return p;
  return {
    ...p,
    reseaux: p.reseaux.filter((r) => r.id !== id),
    regards: p.regards.map((g) => {
      const fe = { ...g.fe };
      delete fe[id];
      return { ...g, fe };
    }),
    troncons: p.troncons.map((t) => ({ ...t, tuyaux: t.tuyaux.filter((x) => x.reseau !== id) })),
  };
}

function feInterpole(a: Regard, b: Regard): Record<string, number> {
  const fe: Record<string, number> = {};
  for (const k of Object.keys(a.fe)) fe[k] = b.fe[k] !== undefined ? (a.fe[k] + b.fe[k]) / 2 : a.fe[k];
  return fe;
}

function feDecale(r: Regard, delta: number): Record<string, number> {
  return Object.fromEntries(Object.entries(r.fe).map(([k, v]) => [k, Math.round((v + delta) * 100) / 100]));
}

/** Insère un regard à la position `index` (le tronçon coupé est scindé en deux) */
export function insererRegard(p: Projet, index: number): Projet {
  const regards = [...p.regards];
  const troncons = [...p.troncons];
  const avant = regards[index - 1];
  const apres = regards[index];
  let r: Regard;
  if (avant && apres) {
    r = nouveauRegard('', (avant.tn + apres.tn) / 2, feInterpole(avant, apres));
    const coupe = troncons[index - 1];
    const moitie = Math.round((coupe.longueur / 2) * 100) / 100;
    troncons[index - 1] = { ...coupe, longueur: moitie };
    troncons.splice(index, 0, { ...dupliquerTroncon(coupe, coupe.longueur - moitie), commePrecedent: true });
  } else if (avant) {
    r = nouveauRegard('', avant.tn, feDecale(avant, -0.2));
    const modele = troncons[troncons.length - 1];
    troncons.push(modele ? { ...dupliquerTroncon(modele), commePrecedent: true } : nouveauTroncon(30, p.reseaux[0].id));
  } else {
    r = nouveauRegard('', apres.tn, feDecale(apres, 0.2));
    troncons.unshift(troncons[0] ? { ...dupliquerTroncon(troncons[0]), commePrecedent: false } : nouveauTroncon(30, p.reseaux[0].id));
  }
  r.nom = `R${regards.length + 1}`;
  regards.splice(index, 0, r);
  return { ...p, regards, troncons };
}

/** Supprime un regard ; les deux tronçons adjacents fusionnent (longueurs additionnées) */
export function supprimerRegard(p: Projet, index: number): Projet {
  if (p.regards.length <= 2) return p;
  const regards = p.regards.filter((_, i) => i !== index);
  const troncons = [...p.troncons];
  if (index === 0) {
    troncons.shift();
  } else if (index === p.regards.length - 1) {
    troncons.pop();
  } else {
    const a = troncons[index - 1];
    const b = troncons[index];
    troncons.splice(index - 1, 2, { ...a, longueur: a.longueur + b.longueur });
  }
  return { ...p, regards, troncons };
}

function nombre(v: unknown, defaut: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : defaut;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Brut = Record<string, any>;

/**
 * Valide et complète un projet chargé depuis un fichier JSON. Reprend aussi les projets
 * des versions précédentes : fil d'eau unique par regard, et tuyaux à « fil d'eau propre »
 * (convertis en réseaux supplémentaires).
 */
export function normaliserProjet(brut: unknown): Projet {
  const o = brut as Brut | null;
  if (!o || !Array.isArray(o.regards) || !Array.isArray(o.troncons)) {
    throw new Error('Fichier de projet invalide.');
  }
  if (o.regards.length < 2 || o.troncons.length !== o.regards.length - 1) {
    throw new Error('Le projet doit contenir au moins 2 regards et un tronçon entre chaque paire de regards.');
  }

  const lireEnrobage = (e: Brut | undefined): Enrobage => ({
    materiau: typeof e?.materiau === 'string' ? e.materiau : ENROBAGE_DEFAUT.materiau,
    bas: nombre(e?.bas, ENROBAGE_DEFAUT.bas),
    haut: nombre(e?.haut, ENROBAGE_DEFAUT.haut),
    gauche: nombre(e?.gauche, ENROBAGE_DEFAUT.gauche),
    droite: nombre(e?.droite, ENROBAGE_DEFAUT.droite),
  });
  /** Enrobage par réseau : celui du fichier, sinon (anciennes versions) celui du premier tuyau du réseau */
  const enrobagesLus = new Map<string, Enrobage>();
  const reseaux: Reseau[] = [];
  for (const r of Array.isArray(o.reseaux) ? (o.reseaux as Brut[]) : []) {
    if (typeof r?.id !== 'string' || reseaux.some((x) => x.id === r.id)) continue;
    const nom = typeof r.nom === 'string' ? r.nom : `Réseau ${reseaux.length + 1}`;
    reseaux.push({
      id: r.id,
      nom,
      couleur: typeof r.couleur === 'string' ? r.couleur : couleurPour(nom, reseaux.map((x) => x.couleur)),
      enrobage: { ...ENROBAGE_DEFAUT },
    });
    if (r.enrobage && typeof r.enrobage === 'object') enrobagesLus.set(r.id, lireEnrobage(r.enrobage));
  }
  if (reseaux.length === 0) reseaux.push(nouveauReseau('EU', COULEURS_RESEAUX[0]));
  const ref = reseaux[0].id;

  const regards: Regard[] = (o.regards as Brut[]).map((r, i) => {
    const tn = nombre(r?.tn, 0);
    const brutFe = r?.fe;
    const fe: Record<string, number> = {};
    if (typeof brutFe === 'number') fe[ref] = brutFe;
    for (const res of reseaux) {
      if (brutFe && typeof brutFe === 'object') fe[res.id] = nombre(brutFe[res.id], NaN);
      if (!Number.isFinite(fe[res.id])) fe[res.id] = Number.isFinite(fe[ref]) ? fe[ref] : tn - 1.5;
    }
    return { id: typeof r?.id === 'string' ? r.id : nouvelId('regard'), nom: typeof r?.nom === 'string' ? r.nom : `R${i + 1}`, tn, fe };
  });

  const base = nouveauTroncon(30, ref);
  const options = (v: Brut | undefined, d: OptionsMateriau): OptionsMateriau => ({
    reutilise: typeof v?.reutilise === 'boolean' ? v.reutilise : d.reutilise,
    foisonnement: typeof v?.foisonnement === 'boolean' ? v.foisonnement : d.foisonnement,
    coefficient: nombre(v?.coefficient, d.coefficient),
  });

  const troncons: Troncon[] = (o.troncons as Brut[]).map((t, ti) => ({
    id: typeof t?.id === 'string' ? t.id : nouvelId('troncon'),
    longueur: nombre(t?.longueur, base.longueur),
    commePrecedent: ti > 0 && t?.commePrecedent === true,
    type: t?.type === 'V' ? ('V' as const) : ('U' as const),
    largeur: nombre(t?.largeur, base.largeur),
    largeurAuto: typeof t?.largeurAuto === 'boolean' ? t.largeurAuto : true,
    blindage: Math.max(0, nombre(t?.blindage, 0)),
    fruit: nombre(t?.fruit, base.fruit),
    surface: t?.surface === 'terre' ? ('terre' as const) : ('enrobe' as const),
    decapage: {
      actif: typeof t?.decapage?.actif === 'boolean' ? t.decapage.actif : base.decapage.actif,
      epaisseur: nombre(t?.decapage?.epaisseur, base.decapage.epaisseur),
    },
    recoupe: {
      actif: t?.recoupe?.actif === true,
      largeur: Math.max(0, nombre(t?.recoupe?.largeur, base.recoupe.largeur)),
    },
    tuyaux: (Array.isArray(t?.tuyaux) ? (t.tuyaux as Brut[]) : []).map((p) => {
      let reseau = typeof p?.reseau === 'string' && reseaux.some((r) => r.id === p.reseau) ? p.reseau : ref;
      // Ancienne version : fil d'eau propre au tuyau → nouveau réseau
      const fp = p?.filDEau;
      if (fp && typeof fp === 'object' && Number.isFinite(fp.amont) && Number.isFinite(fp.aval)) {
        const nom = typeof p.nom === 'string' && p.nom.trim() ? p.nom.trim() : `Réseau ${reseaux.length + 1}`;
        const res = nouveauReseau(nom, couleurPour(nom, reseaux.map((x) => x.couleur)));
        reseaux.push(res);
        const ecart = fp.amont - regards[ti].fe[ref];
        regards.forEach((g, gi) => {
          g.fe[res.id] = gi === ti ? fp.amont : gi === ti + 1 ? fp.aval : g.fe[ref] + ecart;
        });
        reseau = res.id;
      }
      if (!enrobagesLus.has(reseau)) enrobagesLus.set(reseau, lireEnrobage(p?.enrobage));
      return {
        id: typeof p?.id === 'string' ? p.id : nouvelId('tuyau'),
        reseau,
        diametre: nombre(p?.diametre, 0.315),
        paroi: nombre(p?.paroi, 0),
        position: nombre(p?.position, 0),
        enrobage: lireEnrobage(p?.enrobage),
      };
    }),
    couches: (Array.isArray(t?.couches) ? (t.couches as Brut[]) : []).map((c, i) => ({
      id: typeof c?.id === 'string' ? c.id : nouvelId('couche'),
      nom: typeof c?.nom === 'string' ? c.nom : `Couche ${i + 1}`,
      epaisseur: nombre(c?.epaisseur, 0.1),
    })),
    remblaiNom: typeof t?.remblaiNom === 'string' ? t.remblaiNom : base.remblaiNom,
    optionsDeblai: options(t?.optionsDeblai, base.optionsDeblai),
    optionsDecapage: options(t?.optionsDecapage, base.optionsDecapage),
  }));
  // L'enrobage appartient au réseau : chaque tuyau reprend celui de son réseau
  for (const r of reseaux) r.enrobage = { ...(enrobagesLus.get(r.id) ?? r.enrobage) };
  for (const t of troncons) for (const x of t.tuyaux) x.enrobage = { ...reseaux.find((r) => r.id === x.reseau)!.enrobage };
  return {
    nom: typeof o.nom === 'string' ? o.nom : 'Projet',
    saisie: o.saisie === 'profondeurs' ? 'profondeurs' : 'altitudes',
    reseaux,
    regards,
    troncons,
  };
}
