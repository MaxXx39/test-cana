import { describe, expect, it } from 'vitest';
import { aireReunionBlocs, calculProjet, calculTroncon, etatCoupe, profondeur, section } from './engine';
import {
  ajouterReseau,
  majReseau,
  propagerTranchees,
  changerDiametre,
  changerEcart,
  dupliquerVers,
  ecartsTuyaux,
  tuyauxGaucheDroite,
  diametreParDefaut,
  poserReseau,
  retirerReseauTroncon,
  insererRegard,
  normaliserProjet,
  nouveauRegard,
  nouveauTroncon,
  projetExemple,
  supprimerRegard,
  supprimerReseau,
} from './projet';
import type { Projet, Troncon, Tuyau } from './types';

const EU = 'eu';
const EP = 'ep';

function tronconNu(partiel: Partial<Troncon> = {}): Troncon {
  return {
    ...nouveauTroncon(10, EU),
    largeur: 1,
    tuyaux: [],
    couches: [],
    decapage: { actif: false, epaisseur: 0 },
    optionsDeblai: { reutilise: false, foisonnement: false, coefficient: 1.25 },
    optionsDecapage: { reutilise: false, foisonnement: false, coefficient: 1.25 },
    ...partiel,
  };
}

/** TN = 100 + H, fil d'eau EU à 100, fil d'eau EP donné (amont, aval) */
function projet(t: Troncon, H1: number, H2: number, ep: [number, number] = [100, 100]): Projet {
  return {
    nom: 't',
    saisie: 'altitudes',
    reseaux: [
      { id: EU, nom: 'EU', couleur: '#000', enrobage: { materiau: 'Sable', bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 } },
      { id: EP, nom: 'EP', couleur: '#00f', enrobage: { materiau: 'Sable', bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 } },
    ],
    regards: [nouveauRegard('A', 100 + H1, { [EU]: 100, [EP]: ep[0] }), nouveauRegard('B', 100 + H2, { [EU]: 100, [EP]: ep[1] })],
    troncons: [t],
  };
}

const tuyau: Tuyau = {
  id: 'p',
  reseau: EU,
  diametre: 0.4,
  paroi: 0,
  position: 0,
  enrobage: { materiau: 'Sable', bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 },
};

describe('volumes de fouille', () => {
  it('tranchée en U : hauteur moyenne × largeur × longueur', () => {
    const r = calculTroncon(projet(tronconNu(), 2, 1), 0);
    expect(r.fouille).toBeCloseTo(15, 9);
    expect(r.deblai).toBeCloseTo(15, 9);
    expect(r.remblai).toBeCloseTo(15, 9);
    expect(r.surfaceBlindage).toBeCloseTo(2 * 10 * 1.5, 9);
  });

  it('tranchée en V : élargissement intégré sur la longueur', () => {
    const r = calculTroncon(projet(tronconNu({ type: 'V', fruit: 0.5 }), 2, 1), 0);
    // L × (W·Hm + f·(H1² + H1·H2 + H2²)/3)
    expect(r.fouille).toBeCloseTo(10 * (1 * 1.5 + (0.5 * 7) / 3), 9);
    expect(r.surfaceTete).toBeCloseTo(10 * (1 + 2 * 0.5 * 1.5), 9);
    expect(r.surfaceBlindage).toBe(0);
  });

  it('la profondeur intègre le calage sous fil d’eau du tuyau le plus exigeant', () => {
    const t = tronconNu({
      tuyaux: [
        { ...tuyau, paroi: 0.03, enrobage: { materiau: 'Sable', bas: 0.1, haut: 0.1, gauche: 0.1, droite: 0.1 } },
        { ...tuyau, id: 'q', position: 1, enrobage: { materiau: 'Sable', bas: 0.15, haut: 0.1, gauche: 0.1, droite: 0.1 } },
      ],
    });
    const p = projet(t, 2, 2);
    expect(profondeur(t, p.regards[0], p.regards[1], 0)).toBeCloseTo(2.15, 9);
  });
});

describe('enrobage', () => {
  it('bloc moins cylindre', () => {
    const s = section(tronconNu({ largeur: 0.8, tuyaux: [tuyau] }), 2);
    const tuyauAire = Math.PI * 0.04;
    expect(s.tuyaux).toBeCloseTo(tuyauAire, 9);
    expect(s.enrobage).toBeCloseTo(0.8 * 0.7 - tuyauAire, 9);
    expect(s.remblai).toBeCloseTo(0.8 * 2 - 0.8 * 0.7, 9);
  });

  it('les recouvrements entre blocs ne sont comptés qu’une fois', () => {
    const t = tronconNu({
      largeur: 2,
      tuyaux: [
        { ...tuyau, id: 'a', position: -0.3 },
        { ...tuyau, id: 'b', position: 0.3 },
      ],
    });
    // Blocs [-0.7, 0.1] et [-0.1, 0.7] sur 0.7 m de haut → réunion 1.4 m × 0.7 m
    const s = section(t, 2);
    expect(s.enrobage).toBeCloseTo(1.4 * 0.7 - 2 * Math.PI * 0.04, 9);
  });

  it('le bloc est rogné par les talus d’une tranchée en V', () => {
    const t = tronconNu({ type: 'V', largeur: 0.6, fruit: 1 });
    const aire = aireReunionBlocs(t, [{ x0: -0.5, x1: 0.5, y0: 0, y1: 0.4 }], 2);
    // ∫0^0.2 (0.6 + 2y) dy + 0.2 × 1.0
    expect(aire).toBeCloseTo(0.16 + 0.2, 9);
  });

  it('le volume d’enrobage est constant le long du tronçon', () => {
    const r = calculTroncon(projet(tronconNu({ largeur: 0.8, tuyaux: [tuyau] }), 2.5, 1.5), 0);
    expect(r.enrobage).toBeCloseTo(10 * (0.8 * 0.7 - Math.PI * 0.04), 9);
  });
});

describe('plusieurs réseaux dans la tranchée', () => {
  const eu = { ...tuyau, position: -0.5 };
  const ep = { ...tuyau, id: 'b', reseau: EP, position: 0.5 };

  it('le fond suit le réseau le plus profond, l’enrobage du réseau haut part de son lit', () => {
    const t = tronconNu({ largeur: 2, tuyaux: [eu, ep] });
    const p = projet(t, 2, 2, [100.5, 100.5]); // TN 102, EU 100, EP 100,5
    const e = etatCoupe(t, p.regards[0], p.regards[1], 0);
    expect(e.H).toBeCloseTo(2.1, 9);
    expect(e.basTuyaux[0]).toBeCloseTo(0.1, 9);
    expect(e.basTuyaux[1]).toBeCloseTo(0.6, 9);
    const r = calculTroncon(p, 0);
    // blocs [-0.9,-0.1]×[0,0.7] et [0.1,0.9]×[0.5,1.2]
    expect(r.enrobage).toBeCloseTo(10 * (2 * 0.8 * 0.7 - 2 * Math.PI * 0.04), 9);
    expect(r.remblai).toBeCloseTo(10 * (2 * 2.1 - 2 * 0.8 * 0.7), 9);
    expect(r.canalisations.map((c) => [c.nom, c.longueur])).toEqual([
      ['EU', 10],
      ['EP', 10],
    ]);
  });

  it('réseaux superposés : la réunion des enrobages est comptée une fois', () => {
    const t = tronconNu({ largeur: 1, tuyaux: [{ ...eu, position: 0 }, { ...ep, position: 0 }] });
    const r = calculTroncon(projet(t, 2, 2, [100.6, 100.6]), 0);
    // blocs [−0.4,0.4]×[0,0.7] et [−0.4,0.4]×[0.6,1.3] → réunion 0.8 × 1.3
    expect(r.enrobage).toBeCloseTo(10 * (0.8 * 1.3 - 2 * Math.PI * 0.04), 9);
    expect(r.alertes.some((a) => a.includes('EU Ø400') && a.includes('se recouvrent'))).toBe(true);
    expect(r.alertes.some((a) => a.includes('se chevauchent'))).toBe(false);
  });

  it('le réseau qui fixe le fond change le long du tronçon', () => {
    const t = tronconNu({ largeur: 2, tuyaux: [eu, ep] });
    const r = calculTroncon(projet(t, 2, 2, [100.5, 99.5]), 0);
    expect(r.H1).toBeCloseTo(2.1, 9);
    expect(r.H2).toBeCloseTo(2.6, 9);
    // H = 2,1 jusqu'à mi-longueur puis 1,6 + u : hauteur moyenne 2,225
    expect(r.fouille).toBeCloseTo(10 * 2 * 2.225, 9);
    expect(r.surfaceBlindage).toBeCloseTo(2 * 10 * 2.225, 9);
  });
});

describe('trois réseaux ou plus', () => {
  it('le fond suit le plus profond des trois, y compris quand ils se croisent', () => {
    const t = tronconNu({
      largeur: 3,
      tuyaux: [
        { ...tuyau, id: 'a', position: -1 },
        { ...tuyau, id: 'b', reseau: EP, position: 0 },
        { ...tuyau, id: 'c', reseau: 'aep', position: 1 },
      ],
    });
    const p = projet(t, 2, 2, [100.4, 99.4]);
    p.reseaux.push({ id: 'aep', nom: 'AEP', couleur: '#0a0', enrobage: tuyau.enrobage });
    p.regards[0].fe.aep = 99.7;
    p.regards[1].fe.aep = 100.2;
    const [ra, rb] = p.regards;
    // fond = min des trois lits : (AEP, EU puis EP prennent tour à tour le dessus)
    const n = 4000;
    let hMoyen = 0;
    for (let i = 0; i < n; i++) hMoyen += etatCoupe(t, ra, rb, (i + 0.5) / n).H / n;
    const r = calculTroncon(p, 0);
    expect(r.fouille).toBeCloseTo(10 * 3 * hMoyen, 4);
    expect(r.H1).toBeCloseTo(102 - 99.6, 9);
    expect(r.H2).toBeCloseTo(102 - 99.3, 9);
    expect(r.canalisations.map((c) => c.nom)).toEqual(['EU', 'EP', 'AEP']);
    const structure = r.couches.reduce((a, c) => a + c.volume, 0);
    expect(r.enrobage + r.tuyaux + structure + r.remblai).toBeCloseTo(r.fouille, 6);
  });
});

describe('nature de l’enrobage', () => {
  it('volumes d’enrobage par nature, total inchangé', () => {
    const sable = { ...tuyau, id: 'a', position: -0.5 };
    const beton = { ...tuyau, id: 'b', reseau: EP, position: 0.5, enrobage: { ...tuyau.enrobage, materiau: 'Béton' } };
    const t = tronconNu({ largeur: 2, tuyaux: [sable, beton] });
    const r = calculTroncon(projet(t, 2, 2), 0);
    const net = 10 * (0.8 * 0.7 - Math.PI * 0.04);
    expect(r.enrobages).toEqual([
      { nom: 'Sable', volume: expect.closeTo(net, 9) },
      { nom: 'Béton', volume: expect.closeTo(net, 9) },
    ]);
    expect(r.enrobage).toBeCloseTo(2 * net, 9);
    // blocs qui se recouvrent : la zone commune est comptée une seule fois, pour la première nature
    const t2 = tronconNu({ largeur: 2, tuyaux: [{ ...sable, position: -0.3 }, { ...beton, position: 0.3 }] });
    const r2 = calculTroncon(projet(t2, 2, 2), 0);
    expect(r2.enrobages[0].volume + r2.enrobages[1].volume).toBeCloseTo(r2.enrobage, 9);
    expect(r2.enrobages[0].volume).toBeCloseTo(net, 9);
    const g = calculProjet(projet(t, 2, 2)).global;
    expect(g.enrobages.map((e) => e.nom)).toEqual(['Sable', 'Béton']);
  });
});

describe('structure et décapage', () => {
  it('épaisseur × largeur × longueur en U', () => {
    const t = tronconNu({
      decapage: { actif: true, epaisseur: 0.08 },
      couches: [
        { id: 'a', nom: 'Enrobé', epaisseur: 0.1 },
        { id: 'b', nom: 'Grave', epaisseur: 0.2 },
      ],
    });
    const r = calculTroncon(projet(t, 2, 2), 0);
    expect(r.decapage).toBeCloseTo(0.8, 9);
    expect(r.deblai).toBeCloseTo(20 - 0.8, 9);
    expect(r.couches.map((c) => c.volume)).toEqual([expect.closeTo(1, 9), expect.closeTo(2, 9)]);
    expect(r.remblai).toBeCloseTo(20 - 3, 9);
  });

  it('largeur réelle au niveau de la couche en V', () => {
    const t = tronconNu({ type: 'V', fruit: 0.5, couches: [{ id: 'a', nom: 'Enrobé', epaisseur: 0.1 }] });
    const s = section(t, 2);
    // largeur en tête 3 m, se réduisant de 2 × 0.5 × z
    expect(s.couches[0]).toBeCloseTo(0.1 * 3 - 0.5 * 0.01, 9);
  });

  it('les couches sont écrêtées au-dessus de l’enrobage', () => {
    const t = tronconNu({ largeur: 0.8, tuyaux: [tuyau], couches: [{ id: 'a', nom: 'Grave', epaisseur: 5 }] });
    const s = section(t, 2);
    expect(s.couches[0]).toBeCloseTo(0.8 * (2 - 0.7), 9);
    expect(s.remblai).toBeCloseTo(0, 9);
    const r = calculTroncon(projet(t, 2, 2), 0);
    expect(r.alertes.some((a) => a.includes('écrêtées'))).toBe(true);
  });
});

describe('réutilisation et foisonnement', () => {
  it('réemploi foisonné et évacuation', () => {
    const t = tronconNu({
      decapage: { actif: true, epaisseur: 0.1 },
      optionsDeblai: { reutilise: true, foisonnement: true, coefficient: 1.2 },
      optionsDecapage: { reutilise: false, foisonnement: false, coefficient: 1.3 },
    });
    const r = calculTroncon(projet(t, 2, 2), 0);
    expect(r.extraitDeblai.enPlace).toBeCloseTo(19, 9);
    expect(r.reemploi).toBeCloseTo(19 * 1.2, 9);
    expect(r.evacuation).toBeCloseTo(1, 9);
    // remblai 20 m³ (pas de structure), réemploi en place 19 m³
    expect(r.apport).toBeCloseTo(1, 9);
  });

  it('total global = somme des tronçons', () => {
    const p = projetExemple();
    const { troncons, global } = calculProjet(p);
    expect(global.fouille).toBeCloseTo(
      troncons.reduce((s, r) => s + r.fouille, 0),
      9,
    );
    expect(global.decapageTerre + global.decapageEnrobe).toBeCloseTo(
      troncons.reduce((s, r) => s + r.decapage, 0),
      9,
    );
    for (const r of troncons) {
      // conservation : fouille = enrobage + tuyaux + structure + remblai (sans écrêtage)
      const structure = r.couches.reduce((s, c) => s + c.volume, 0);
      expect(r.enrobage + r.tuyaux + structure + r.remblai).toBeCloseTo(r.fouille, 6);
      expect(r.alertes).toEqual([]);
    }
    // EU sur les 3 tronçons, EP sur les 2 premiers
    expect(global.canalisations.map((c) => [c.nom, c.longueur])).toEqual([
      ['EU', 105.5],
      ['EP', 77.5],
    ]);
  });
});

describe('édition du tracé et des réseaux', () => {
  it('insérer puis supprimer un regard conserve la cohérence', () => {
    const p = projetExemple();
    const longueur = p.troncons.reduce((s, t) => s + t.longueur, 0);
    const q = insererRegard(p, 1);
    expect(q.regards).toHaveLength(5);
    expect(q.troncons).toHaveLength(4);
    expect(q.troncons.reduce((s, t) => s + t.longueur, 0)).toBeCloseTo(longueur, 9);
    // fils d'eau interpolés pour chaque réseau
    for (const r of p.reseaux) expect(q.regards[1].fe[r.id]).toBeCloseTo((p.regards[0].fe[r.id] + p.regards[1].fe[r.id]) / 2, 9);
    const r = supprimerRegard(q, 1);
    expect(r.troncons).toHaveLength(3);
    expect(r.troncons.reduce((s, t) => s + t.longueur, 0)).toBeCloseTo(longueur, 9);
    expect(insererRegard(p, 4).troncons).toHaveLength(4);
    expect(insererRegard(p, 0).troncons).toHaveLength(4);
  });

  it('poser et retirer un réseau dans un tronçon', () => {
    const p = projetExemple();
    const [eu, ep] = p.reseaux.map((r) => r.id);
    const t3 = p.troncons[2];
    expect(t3.tuyaux.map((x) => x.reseau)).toEqual([eu]);
    const pose = poserReseau(t3, p.reseaux[1], diametreParDefaut(p, ep), [eu, ep]);
    expect(pose.tuyaux.map((x) => x.reseau)).toEqual([eu, ep]);
    expect(pose.tuyaux[1].diametre).toBeCloseTo(0.4, 9);
    // côte à côte, centrés, tranchée élargie à la somme des largeurs d'enrobage
    // blocs de 0,50 m (EU Ø200) et 0,70 m (EP Ø400) sur [−0,60 ; 0,60]
    expect(pose.tuyaux[0].position).toBeCloseTo(-0.35, 9);
    expect(pose.tuyaux[1].position).toBeCloseTo(0.25, 9);
    expect(pose.largeur).toBeCloseTo(0.5 + 0.7, 9);
    expect(poserReseau(pose, p.reseaux[1], 0.3, [eu, ep])).toBe(pose);
    const retire = retirerReseauTroncon(pose, ep);
    expect(retire.tuyaux.map((x) => x.reseau)).toEqual([eu]);
    expect(retire.tuyaux[0].position).toBeCloseTo(0, 9);
    // largeur automatique : ramenée à l'emprise de l'enrobage restant
    expect(retire.largeur).toBeCloseTo(0.5, 9);
    // largeur fixe : conservée
    expect(retirerReseauTroncon({ ...pose, largeurAuto: false }, ep).largeur).toBeCloseTo(1.2, 9);
  });

  it('écart nu à nu entre réseaux et largeur automatique', () => {
    const p = projetExemple();
    const t = p.troncons[0]; // EU Ø200 + EP Ø400, enrobages 15 cm, jointifs
    expect(ecartsTuyaux(tuyauxGaucheDroite(t.tuyaux))).toEqual([0, expect.closeTo(0.3, 9)]);
    const e = changerEcart(t, tuyauxGaucheDroite(t.tuyaux)[1].id, 0.5);
    const [a, b] = tuyauxGaucheDroite(e.tuyaux);
    expect(b.position - b.diametre / 2 - (a.position + a.diametre / 2)).toBeCloseTo(0.5, 9);
    expect(e.largeur).toBeCloseTo(1.4, 9);
    // groupe centré : emprise symétrique
    expect(a.position - a.diametre / 2 - a.enrobage.gauche).toBeCloseTo(-(b.position + b.diametre / 2 + b.enrobage.droite), 9);
    // un changement de diamètre conserve l'écart
    const d = changerDiametre(e, p.reseaux[0].id, 0.3);
    const [c, f] = tuyauxGaucheDroite(d.tuyaux);
    expect(f.position - f.diametre / 2 - (c.position + c.diametre / 2)).toBeCloseTo(0.5, 9);
    expect(d.largeur).toBeCloseTo(1.5, 9);
  });

  it('le blindage élargit la fouille, pas la largeur utile des tuyaux', () => {
    const t = tronconNu({ largeur: 1, blindage: 0.05, tuyaux: [{ ...tuyau, enrobage: { materiau: 'Sable', bas: 0.1, haut: 0.2, gauche: 0.3, droite: 0.3 } }] });
    const r = calculTroncon(projet(t, 2, 2), 0);
    expect(r.fouille).toBeCloseTo(10 * 1.1 * 2.1, 9);
    expect(r.surfaceTete).toBeCloseTo(10 * 1.1, 9);
    // enrobage rogné à la largeur utile (1 m), sans alerte
    expect(r.enrobage).toBeCloseTo(10 * (1 * 0.7 - Math.PI * 0.04), 9);
    expect(r.alertes).toEqual([]);
    // pas de blindage en V
    const v = calculTroncon(projet(tronconNu({ type: 'V', fruit: 0, largeur: 1, blindage: 0.05 }), 2, 2), 0);
    expect(v.fouille).toBeCloseTo(20, 9);
  });

  it('dupliquer une tranchée vers d’autres tronçons', () => {
    const p = projetExemple();
    const source = p.troncons[0];
    // tranchée et structure seulement : le tronçon 3 garde son EU seul et sa longueur
    const q = dupliquerVers(p, 0, [2], { tuyaux: false });
    const t3 = q.troncons[2];
    expect(t3.id).toBe(p.troncons[2].id);
    expect(t3.longueur).toBe(28);
    expect(t3.type).toBe('U');
    expect(t3.blindage).toBe(source.blindage);
    expect(t3.couches.map((c) => [c.nom, c.epaisseur])).toEqual(source.couches.map((c) => [c.nom, c.epaisseur]));
    expect(t3.couches[0].id).not.toBe(source.couches[0].id);
    expect(t3.tuyaux.map((x) => x.reseau)).toEqual([p.reseaux[0].id]);
    expect(q.troncons[1]).toBe(p.troncons[1]);
    // avec les tuyaux : mêmes réseaux, diamètres et positions, nouveaux identifiants
    const r = dupliquerVers(p, 0, [1, 2], { tuyaux: true });
    for (const i of [1, 2]) {
      expect(r.troncons[i].tuyaux.map((x) => [x.reseau, x.diametre, x.position])).toEqual(source.tuyaux.map((x) => [x.reseau, x.diametre, x.position]));
      expect(r.troncons[i].tuyaux[0].id).not.toBe(source.tuyaux[0].id);
    }
    expect(r.troncons[1].longueur).toBe(42.5);
  });

  it('l’enrobage se règle par réseau et s’applique à tous ses tuyaux', () => {
    const p = projetExemple();
    const ep = p.reseaux[1];
    const q = majReseau(p, { ...ep, enrobage: { materiau: 'Sable', bas: 0.12, haut: 0.3, gauche: 0.2, droite: 0.25 } });
    const tuyauxEp = q.troncons.flatMap((t) => t.tuyaux.filter((x) => x.reseau === ep.id));
    expect(tuyauxEp).toHaveLength(2);
    for (const x of tuyauxEp) expect(x.enrobage).toEqual({ materiau: 'Sable', bas: 0.12, haut: 0.3, gauche: 0.2, droite: 0.25 });
    // EU inchangé, écart nu à nu conservé, largeur automatique ajustée (+5 cm à gauche, +10 cm à droite)
    expect(q.troncons[0].tuyaux.find((x) => x.reseau === p.reseaux[0].id)!.enrobage).toEqual(p.reseaux[0].enrobage);
    expect(ecartsTuyaux(tuyauxGaucheDroite(q.troncons[0].tuyaux))[1]).toBeCloseTo(0.3, 9);
    expect(q.troncons[0].largeur).toBeCloseTo(p.troncons[0].largeur + 0.1, 9);
    // un nouveau tuyau EP prend l’enrobage du réseau
    const t3 = poserReseau(q.troncons[2], q.reseaux[1], 0.4, q.reseaux.map((r) => r.id));
    expect(t3.tuyaux.find((x) => x.reseau === ep.id)!.enrobage).toEqual(q.reseaux[1].enrobage);
  });

  it('même tranchée que le tronçon précédent, de proche en proche', () => {
    const p = projetExemple();
    const lie = { ...p, troncons: p.troncons.map((t, i) => (i === 2 ? { ...t, commePrecedent: true } : t)) };
    const q = propagerTranchees(lie);
    const [t2, t3] = [q.troncons[1], q.troncons[2]];
    expect(t3.type).toBe(t2.type);
    expect(t3.blindage).toBe(t2.blindage);
    expect(t3.couches.map((c) => [c.nom, c.epaisseur])).toEqual(t2.couches.map((c) => [c.nom, c.epaisseur]));
    // ses tuyaux et sa longueur restent les siens (EU seul, 28 m)
    expect(t3.tuyaux.map((x) => x.reseau)).toEqual([p.reseaux[0].id]);
    expect(t3.longueur).toBe(28);
    // une modification du tronçon 2 se propage, un projet déjà à jour est renvoyé tel quel
    expect(propagerTranchees(q)).toBe(q);
    const r = propagerTranchees({
      ...q,
      troncons: q.troncons.map((t, i) => (i === 1 ? { ...t, couches: [{ ...t.couches[0], epaisseur: 0.1 }] } : t)),
    });
    expect(r.troncons[2].couches.map((c) => c.epaisseur)).toEqual([0.1]);
    // chaîne : 2 suit 1, 3 suit 2
    const chaine = propagerTranchees({ ...lie, troncons: lie.troncons.map((t, i) => (i === 1 ? { ...t, commePrecedent: true, blindage: 0.2 } : t)) });
    expect(chaine.troncons[1].blindage).toBe(p.troncons[0].blindage);
    expect(chaine.troncons[2].blindage).toBe(p.troncons[0].blindage);
  });

  it('ajouter puis supprimer un réseau', () => {
    const p = ajouterReseau(projetExemple());
    expect(p.reseaux).toHaveLength(3);
    const id = p.reseaux[2].id;
    expect(p.regards.every((g) => Number.isFinite(g.fe[id]))).toBe(true);
    const ep = p.reseaux[1].id;
    const q = supprimerReseau(p, ep);
    expect(q.reseaux).toHaveLength(2);
    expect(q.troncons.every((t) => t.tuyaux.every((x) => x.reseau !== ep))).toBe(true);
    expect(q.regards.every((g) => !(ep in g.fe))).toBe(true);
  });

  it('un projet exporté puis réimporté est identique', () => {
    const p = projetExemple();
    expect(normaliserProjet(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => normaliserProjet({ regards: [] })).toThrow();
  });

  it('reprend un projet de la version précédente (fil d’eau unique, fil d’eau propre)', () => {
    const ancien = {
      nom: 'ancien',
      regards: [
        { id: 'r1', nom: 'R1', tn: 102, fe: 100 },
        { id: 'r2', nom: 'R2', tn: 102, fe: 99.8 },
        { id: 'r3', nom: 'R3', tn: 102, fe: 99.6 },
      ],
      troncons: [
        { longueur: 10, tuyaux: [{ nom: 'EU', diametre: 0.2, filDEau: null }] },
        { longueur: 10, tuyaux: [{ nom: 'EU', diametre: 0.2 }, { nom: 'EP', diametre: 0.3, filDEau: { amont: 100.3, aval: 100.1 } }] },
      ],
    };
    const p = normaliserProjet(ancien);
    expect(p.reseaux).toHaveLength(2);
    const [ref, ep] = p.reseaux.map((r) => r.id);
    expect(p.reseaux[1].nom).toBe('EP');
    expect(p.regards.map((g) => g.fe[ref])).toEqual([100, 99.8, 99.6]);
    expect(p.regards[1].fe[ep]).toBeCloseTo(100.3, 9);
    expect(p.regards[2].fe[ep]).toBeCloseTo(100.1, 9);
    expect(p.troncons[1].tuyaux.map((x) => x.reseau)).toEqual([ref, ep]);
  });
});
