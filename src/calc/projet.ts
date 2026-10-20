import type { Couche, OptionsMateriau, Projet, Regard, Troncon, Tuyau } from './types';

let compteur = 0;
export function nouvelId(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${Date.now().toString(36)}-${compteur.toString(36)}`;
}

const optionsDeblaiDefaut: OptionsMateriau = { reutilise: false, foisonnement: true, coefficient: 1.25 };
const optionsDecapageDefaut: OptionsMateriau = { reutilise: false, foisonnement: true, coefficient: 1.25 };

export function nouveauTuyau(nom = 'Tuyau 1', position = 0): Tuyau {
  return {
    id: nouvelId('tuyau'),
    nom,
    diametre: 0.315,
    paroi: 0,
    position,
    filDEau: null,
    enrobage: { bas: 0.1, haut: 0.15, gauche: 0.15, droite: 0.15 },
  };
}

export function nouvelleCouche(nom = 'Grave 0/31.5', epaisseur = 0.3): Couche {
  return { id: nouvelId('couche'), nom, epaisseur };
}

export function nouveauTroncon(longueur = 30): Troncon {
  return {
    id: nouvelId('troncon'),
    longueur,
    type: 'U',
    largeur: 0.8,
    fruit: 0.5,
    surface: 'enrobe',
    decapage: { actif: true, epaisseur: 0.08 },
    tuyaux: [nouveauTuyau()],
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

export function nouveauRegard(nom: string, tn = 100, fe = 98.5): Regard {
  return { id: nouvelId('regard'), nom, tn, fe };
}

export function projetExemple(): Projet {
  const regards = [
    nouveauRegard('R1', 102.4, 100.8),
    nouveauRegard('R2', 102.1, 100.55),
    nouveauRegard('R3', 101.6, 100.3),
    nouveauRegard('R4', 101.5, 100.05),
  ];
  const t1 = nouveauTroncon(35);
  const t2 = nouveauTroncon(42.5);
  const t3 = nouveauTroncon(28);
  t3.type = 'V';
  t3.largeur = 0.7;
  t3.surface = 'terre';
  t3.decapage = { actif: true, epaisseur: 0.2 };
  t3.couches = [];
  t3.optionsDeblai.reutilise = true;
  t3.optionsDecapage.reutilise = true;
  return { nom: 'Nouveau projet', regards, troncons: [t1, t2, t3] };
}

/** Insère un regard à la position `index` (le tronçon coupé est scindé en deux) */
export function insererRegard(p: Projet, index: number): Projet {
  const regards = [...p.regards];
  const troncons = [...p.troncons];
  const avant = regards[index - 1];
  const apres = regards[index];
  let r: Regard;
  if (avant && apres) {
    r = nouveauRegard('', (avant.tn + apres.tn) / 2, (avant.fe + apres.fe) / 2);
    const coupe = troncons[index - 1];
    const moitie = Math.round((coupe.longueur / 2) * 100) / 100;
    troncons[index - 1] = { ...coupe, longueur: moitie };
    troncons.splice(index, 0, dupliquerTroncon(coupe, coupe.longueur - moitie));
  } else if (avant) {
    r = nouveauRegard('', avant.tn, avant.fe - 0.2);
    const modele = troncons[troncons.length - 1];
    troncons.push(modele ? dupliquerTroncon(modele) : nouveauTroncon());
  } else {
    r = nouveauRegard('', apres ? apres.tn : 100, apres ? apres.fe + 0.2 : 98.5);
    if (apres) troncons.unshift(troncons[0] ? dupliquerTroncon(troncons[0]) : nouveauTroncon());
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

/** Valide et complète un projet chargé depuis un fichier JSON */
export function normaliserProjet(brut: unknown): Projet {
  const o = brut as Partial<Projet> | null;
  if (!o || !Array.isArray(o.regards) || !Array.isArray(o.troncons)) {
    throw new Error('Fichier de projet invalide.');
  }
  if (o.regards.length < 2 || o.troncons.length !== o.regards.length - 1) {
    throw new Error('Le projet doit contenir au moins 2 regards et un tronçon entre chaque paire de regards.');
  }
  const base = nouveauTroncon();
  const regards = o.regards.map((r, i) => ({
    id: typeof r?.id === 'string' ? r.id : nouvelId('regard'),
    nom: typeof r?.nom === 'string' ? r.nom : `R${i + 1}`,
    tn: nombre(r?.tn, 0),
    fe: nombre(r?.fe, 0),
  }));
  const options = (v: Partial<OptionsMateriau> | undefined, d: OptionsMateriau): OptionsMateriau => ({
    reutilise: typeof v?.reutilise === 'boolean' ? v.reutilise : d.reutilise,
    foisonnement: typeof v?.foisonnement === 'boolean' ? v.foisonnement : d.foisonnement,
    coefficient: nombre(v?.coefficient, d.coefficient),
  });
  const troncons = o.troncons.map((t) => ({
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
    tuyaux: (Array.isArray(t?.tuyaux) ? t.tuyaux : []).map((p, i) => ({
      id: typeof p?.id === 'string' ? p.id : nouvelId('tuyau'),
      nom: typeof p?.nom === 'string' ? p.nom : `Tuyau ${i + 1}`,
      diametre: nombre(p?.diametre, 0.315),
      paroi: nombre(p?.paroi, 0),
      position: nombre(p?.position, 0),
      filDEau:
        p?.filDEau && typeof p.filDEau === 'object'
          ? { amont: nombre(p.filDEau.amont, 0), aval: nombre(p.filDEau.aval, 0) }
          : null,
      enrobage: {
        bas: nombre(p?.enrobage?.bas, 0.1),
        haut: nombre(p?.enrobage?.haut, 0.15),
        gauche: nombre(p?.enrobage?.gauche, 0.15),
        droite: nombre(p?.enrobage?.droite, 0.15),
      },
    })),
    couches: (Array.isArray(t?.couches) ? t.couches : []).map((c, i) => ({
      id: typeof c?.id === 'string' ? c.id : nouvelId('couche'),
      nom: typeof c?.nom === 'string' ? c.nom : `Couche ${i + 1}`,
      epaisseur: nombre(c?.epaisseur, 0.1),
    })),
    remblaiNom: typeof t?.remblaiNom === 'string' ? t.remblaiNom : base.remblaiNom,
    optionsDeblai: options(t?.optionsDeblai, base.optionsDeblai),
    optionsDecapage: options(t?.optionsDecapage, base.optionsDecapage),
  }));
  return { nom: typeof o.nom === 'string' ? o.nom : 'Projet', regards, troncons };
}
