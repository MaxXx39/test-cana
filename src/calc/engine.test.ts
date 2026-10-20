import { describe, expect, it } from 'vitest';
import { aireReunionBlocs, calculProjet, calculTroncon, etatCoupe, profondeur, section } from './engine';
import { insererRegard, normaliserProjet, nouveauRegard, nouveauTroncon, projetExemple, supprimerRegard } from './projet';
import type { Projet, Troncon } from './types';

function tronconNu(partiel: Partial<Troncon> = {}): Troncon {
  return {
    ...nouveauTroncon(10),
    largeur: 1,
    tuyaux: [],
    couches: [],
    decapage: { actif: false, epaisseur: 0 },
    optionsDeblai: { reutilise: false, foisonnement: false, coefficient: 1.25 },
    optionsDecapage: { reutilise: false, foisonnement: false, coefficient: 1.25 },
    ...partiel,
  };
}

function projet(t: Troncon, H1: number, H2: number): Projet {
  return { nom: 't', regards: [nouveauRegard('A', 100 + H1, 100), nouveauRegard('B', 100 + H2, 100)], troncons: [t] };
}

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
        { ...nouveauTroncon().tuyaux[0], paroi: 0.03, enrobage: { bas: 0.1, haut: 0.1, gauche: 0.1, droite: 0.1 } },
        { ...nouveauTroncon().tuyaux[0], paroi: 0, position: 1, enrobage: { bas: 0.15, haut: 0.1, gauche: 0.1, droite: 0.1 } },
      ],
    });
    const r = nouveauRegard('A', 102, 100);
    expect(profondeur(t, r, r, 0)).toBeCloseTo(2.15, 9);
  });
});

describe('enrobage', () => {
  const tuyau = {
    id: 'p',
    nom: 'P',
    diametre: 0.4,
    paroi: 0,
    position: 0,
    filDEau: null,
    enrobage: { bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 },
  };

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

describe('réseaux à des profondeurs différentes', () => {
  const base = {
    id: 'a',
    nom: 'EU',
    diametre: 0.4,
    paroi: 0,
    position: -0.5,
    filDEau: null,
    enrobage: { bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 },
  };

  it('le fond suit le réseau le plus profond, l’enrobage du réseau haut part de son lit', () => {
    const t = tronconNu({
      largeur: 2,
      tuyaux: [base, { ...base, id: 'b', nom: 'EP', position: 0.5, filDEau: { amont: 100.5, aval: 100.5 } }],
    });
    const p = projet(t, 2, 2); // TN 102, FE des regards 100
    const e = etatCoupe(t, p.regards[0], p.regards[1], 0);
    expect(e.H).toBeCloseTo(2.1, 9);
    expect(e.basTuyaux[0]).toBeCloseTo(0.1, 9);
    expect(e.basTuyaux[1]).toBeCloseTo(0.6, 9);
    const r = calculTroncon(p, 0);
    // blocs [-0.9,-0.1]×[0,0.7] et [0.1,0.9]×[0.5,1.2]
    expect(r.enrobage).toBeCloseTo(10 * (2 * 0.8 * 0.7 - 2 * Math.PI * 0.04), 9);
    expect(r.remblai).toBeCloseTo(10 * (2 * 2.1 - 2 * 0.8 * 0.7), 9);
  });

  it('réseaux superposés : la réunion des enrobages est comptée une fois', () => {
    const t = tronconNu({
      largeur: 1,
      tuyaux: [{ ...base, position: 0 }, { ...base, id: 'b', position: 0, filDEau: { amont: 100.6, aval: 100.6 } }],
    });
    const r = calculTroncon(projet(t, 2, 2), 0);
    // blocs [−0.4,0.4]×[0,0.7] et [−0.4,0.4]×[0.6,1.3] → réunion 0.8 × 1.3
    expect(r.enrobage).toBeCloseTo(10 * (0.8 * 1.3 - 2 * Math.PI * 0.04), 9);
    expect(r.alertes.some((a) => a.includes('se recouvrent'))).toBe(true);
    expect(r.alertes.some((a) => a.includes('se chevauchent'))).toBe(false);
  });

  it('le tuyau qui fixe le fond change le long du tronçon', () => {
    const t = tronconNu({
      largeur: 2,
      tuyaux: [base, { ...base, id: 'b', position: 0.5, filDEau: { amont: 100.5, aval: 99.5 } }],
    });
    const r = calculTroncon(projet(t, 2, 2), 0);
    expect(r.H1).toBeCloseTo(2.1, 9);
    expect(r.H2).toBeCloseTo(2.6, 9);
    // H = 2,1 jusqu'à mi-longueur puis 1,6 + u : hauteur moyenne 2,225
    expect(r.fouille).toBeCloseTo(10 * 2 * 2.225, 9);
    expect(r.surfaceBlindage).toBeCloseTo(2 * 10 * 2.225, 9);
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
    const t = tronconNu({
      largeur: 0.8,
      tuyaux: [
        { id: 'p', nom: 'P', diametre: 0.4, paroi: 0, position: 0, filDEau: null, enrobage: { bas: 0.1, haut: 0.2, gauche: 0.2, droite: 0.2 } },
      ],
      couches: [{ id: 'a', nom: 'Grave', epaisseur: 5 }],
    });
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
    }
  });
});

describe('édition du tracé', () => {
  it('insérer puis supprimer un regard conserve la cohérence', () => {
    const p = projetExemple();
    const longueur = p.troncons.reduce((s, t) => s + t.longueur, 0);
    const q = insererRegard(p, 1);
    expect(q.regards).toHaveLength(5);
    expect(q.troncons).toHaveLength(4);
    expect(q.troncons.reduce((s, t) => s + t.longueur, 0)).toBeCloseTo(longueur, 9);
    const r = supprimerRegard(q, 1);
    expect(r.troncons).toHaveLength(3);
    expect(r.troncons.reduce((s, t) => s + t.longueur, 0)).toBeCloseTo(longueur, 9);
    expect(insererRegard(p, 4).troncons).toHaveLength(4);
    expect(insererRegard(p, 0).troncons).toHaveLength(4);
  });

  it('un projet exporté puis réimporté est identique', () => {
    const p = projetExemple();
    expect(normaliserProjet(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => normaliserProjet({ regards: [] })).toThrow();
  });
});
