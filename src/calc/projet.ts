import type { Couche, OptionsMateriau, Projet, Regard, Reseau, Troncon, Tuyau } from './types';

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

export function nouveauReseau(nom: string, couleur: string): Reseau {
  return { id: nouvelId('reseau'), nom, couleur };
}

export function nouveauTuyau(reseau: string, diametre = 0.315, position = 0): Tuyau {
  return {
    id: nouvelId('tuyau'),
    reseau,
    diametre,
    paroi: 0,
    position,
    enrobage: { bas: 0.1, haut: 0.15, gauche: 0.15, droite: 0.15 },
  };
}

export function nouvelleCouche(nom = 'Grave 0/31.5', epaisseur = 0.3): Couche {
  return { id: nouvelId('couche'), nom, epaisseur };
}

export function nouveauTroncon(longueur: number, reseau: string): Troncon {
  return {
    id: nouvelId('troncon'),
    longueur,
    type: 'U',
    largeur: 0.8,
    fruit: 0.5,
    surface: 'enrobe',
    decapage: { actif: true, epaisseur: 0.08 },
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

/**
 * Place les tuyaux côte à côte (enrobages jointifs), le groupe étant centré.
 * Renvoie aussi la largeur minimale de tranchée correspondante.
 */
export function repartirTuyaux(tuyaux: Tuyau[]): { tuyaux: Tuyau[]; largeur: number } {
  const largeurs = tuyaux.map((p) => p.enrobage.gauche + p.diametre + p.enrobage.droite);
  const total = largeurs.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  const places = tuyaux.map((p, i) => {
    const position = x + p.enrobage.gauche + p.diametre / 2;
    x += largeurs[i];
    return { ...p, position: Math.round(position * 1000) / 1000 };
  });
  return { tuyaux: places, largeur: Math.ceil(total * 100 - 1e-6) / 100 };
}

/** Exemple de départ : double réseau EU + EP sur deux tronçons, EU seul sur le troisième */
export function projetExemple(): Projet {
  const eu = nouveauReseau('EU', '#a8652f');
  const ep = nouveauReseau('EP', '#2f80c4');
  const r = (nom: string, tn: number, feEu: number, feEp: number) => nouveauRegard(nom, tn, { [eu.id]: feEu, [ep.id]: feEp });
  const regards = [r('R1', 102.4, 100.8, 101.05), r('R2', 102.1, 100.55, 100.8), r('R3', 101.6, 100.3, 100.55), r('R4', 101.5, 100.05, 100.3)];

  const double = (longueur: number) => {
    const t = nouveauTroncon(longueur, eu.id);
    const { tuyaux, largeur } = repartirTuyaux([nouveauTuyau(eu.id, 0.2), nouveauTuyau(ep.id, 0.4)]);
    t.tuyaux = tuyaux;
    t.largeur = largeur;
    return t;
  };
  const t1 = double(35);
  const t2 = double(42.5);
  const t3 = nouveauTroncon(28, eu.id);
  t3.tuyaux = [nouveauTuyau(eu.id, 0.2)];
  t3.type = 'V';
  t3.largeur = 0.6;
  t3.surface = 'terre';
  t3.decapage = { actif: true, epaisseur: 0.2 };
  t3.couches = [];
  t3.optionsDeblai.reutilise = true;
  t3.optionsDecapage.reutilise = true;
  return { nom: 'Nouveau projet', reseaux: [eu, ep], regards, troncons: [t1, t2, t3] };
}

/** Ajoute un réseau ; son fil d'eau aux regards part de celui du premier réseau, relevé de 30 cm */
export function ajouterReseau(p: Projet): Projet {
  const nom = `Réseau ${p.reseaux.length + 1}`;
  const r = nouveauReseau(nom, couleurPour(nom, p.reseaux.map((x) => x.couleur)));
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
    troncons.splice(index, 0, dupliquerTroncon(coupe, coupe.longueur - moitie));
  } else if (avant) {
    r = nouveauRegard('', avant.tn, feDecale(avant, -0.2));
    const modele = troncons[troncons.length - 1];
    troncons.push(modele ? dupliquerTroncon(modele) : nouveauTroncon(30, p.reseaux[0].id));
  } else {
    r = nouveauRegard('', apres.tn, feDecale(apres, 0.2));
    troncons.unshift(troncons[0] ? dupliquerTroncon(troncons[0]) : nouveauTroncon(30, p.reseaux[0].id));
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

  const reseaux: Reseau[] = [];
  for (const r of Array.isArray(o.reseaux) ? (o.reseaux as Brut[]) : []) {
    if (typeof r?.id !== 'string' || reseaux.some((x) => x.id === r.id)) continue;
    const nom = typeof r.nom === 'string' ? r.nom : `Réseau ${reseaux.length + 1}`;
    reseaux.push({ id: r.id, nom, couleur: typeof r.couleur === 'string' ? r.couleur : couleurPour(nom, reseaux.map((x) => x.couleur)) });
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
    type: t?.type === 'V' ? ('V' as const) : ('U' as const),
    largeur: nombre(t?.largeur, base.largeur),
    fruit: nombre(t?.fruit, base.fruit),
    surface: t?.surface === 'terre' ? ('terre' as const) : ('enrobe' as const),
    decapage: {
      actif: typeof t?.decapage?.actif === 'boolean' ? t.decapage.actif : base.decapage.actif,
      epaisseur: nombre(t?.decapage?.epaisseur, base.decapage.epaisseur),
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
      return {
        id: typeof p?.id === 'string' ? p.id : nouvelId('tuyau'),
        reseau,
        diametre: nombre(p?.diametre, 0.315),
        paroi: nombre(p?.paroi, 0),
        position: nombre(p?.position, 0),
        enrobage: {
          bas: nombre(p?.enrobage?.bas, 0.1),
          haut: nombre(p?.enrobage?.haut, 0.15),
          gauche: nombre(p?.enrobage?.gauche, 0.15),
          droite: nombre(p?.enrobage?.droite, 0.15),
        },
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
  return { nom: typeof o.nom === 'string' ? o.nom : 'Projet', reseaux, regards, troncons };
}
