import type { ResultatGlobal, ResultatTroncon } from '../calc/engine';

const nb = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(3).replace('.', ',');
const txt = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Export tableur (virgule décimale). Par défaut : CSV séparé par « ; » avec BOM pour Excel ;
 * avec une tabulation, le texte se colle directement dans un tableur.
 */
export function exportCsv(nomProjet: string, resultats: ResultatTroncon[], g: ResultatGlobal, separateur = ';'): string {
  const nomsEnrobages: string[] = [];
  for (const r of resultats) for (const e of r.enrobages) if (!nomsEnrobages.includes(e.nom)) nomsEnrobages.push(e.nom);
  const nomsCouches: string[] = [];
  for (const r of resultats) for (const c of r.couches) if (!nomsCouches.includes(c.nom)) nomsCouches.push(c.nom);

  const lignes: string[] = [];
  lignes.push(txt(nomProjet));
  lignes.push('');
  lignes.push('Détail par tronçon');
  lignes.push(
    [
      'Tronçon',
      'Amont',
      'Aval',
      'Type',
      'Réseaux',
      'Longueur (m)',
      'H amont (m)',
      'H aval (m)',
      'Fouille (m³)',
      'Décapage (m³)',
      'Destination décapage',
      'Décapage compté (m³)',
      'Déblai (m³)',
      'Destination déblai',
      'Déblai compté (m³)',
      ...nomsEnrobages.map((n) => `Enrobage ${n.toLowerCase()} (m³)`),
      ...nomsCouches.map((n) => `${n} (m³)`),
      'Remblai (m³)',
      'Réemploi (m³)',
      'Évacuation (m³)',
      'Apport remblai (m³)',
      'Emprise (m²)',
      'Blindage (m²)',
      'Alertes',
    ]
      .map(txt)
      .join(separateur),
  );
  for (const r of resultats) {
    lignes.push(
      [
        String(r.index + 1),
        txt(r.amont),
        txt(r.aval),
        r.type,
        txt(r.canalisations.map((c) => `${c.nom} Ø${Math.round(c.diametre * 1000)}`).join(' + ')),
        nb(r.longueur),
        nb(r.H1),
        nb(r.H2),
        nb(r.fouille),
        nb(r.decapage),
        r.extraitDecapage.reutilise ? 'Réemploi' : 'Évacuation',
        nb(r.extraitDecapage.compte),
        nb(r.deblai),
        r.extraitDeblai.reutilise ? 'Réemploi' : 'Évacuation',
        nb(r.extraitDeblai.compte),
        ...nomsEnrobages.map((n) => nb(r.enrobages.filter((e) => e.nom === n).reduce((s, e) => s + e.volume, 0))),
        ...nomsCouches.map((n) => nb(r.couches.filter((c) => c.nom === n).reduce((s, c) => s + c.volume, 0))),
        nb(r.remblai),
        nb(r.reemploi),
        nb(r.evacuation),
        nb(r.apport),
        nb(r.surfaceTete),
        nb(r.surfaceBlindage),
        txt(r.alertes.join(' | ')),
      ].join(separateur),
    );
  }
  lignes.push('');
  lignes.push('Total global');
  const total: [string, number, string][] = [
    ['Linéaire de tranchée', g.longueur, 'm'],
    ...g.canalisations.map((c): [string, number, string] => [`Canalisation ${c.nom} Ø${Math.round(c.diametre * 1000)}`, c.longueur, 'm']),
    ['Fouille totale', g.fouille, 'm³'],
    ['Décapage enrobé', g.decapageEnrobe, 'm³'],
    ['Décapage terre', g.decapageTerre, 'm³'],
    ['Déblai (hors décapage)', g.deblai, 'm³'],
    ...g.enrobages.map((e): [string, number, string] => [`Enrobage ${e.nom.toLowerCase()}`, e.volume, 'm³']),
    ...g.couches.map((c): [string, number, string] => [c.nom, c.volume, 'm³']),
    ['Remblai (besoin)', g.remblai, 'm³'],
    ['Remblai d’apport', g.apport, 'm³'],
    ['Remblai réemployé', g.reemploi, 'm³'],
    ['Évacuation', g.evacuation, 'm³'],
    ['Emprise en tête', g.surfaceTete, 'm²'],
    ['Blindage', g.surfaceBlindage, 'm²'],
  ];
  for (const [lib, v, u] of total) lignes.push([txt(lib), nb(v), u].join(separateur));
  // BOM pour qu'Excel détecte l'UTF-8 d'un fichier CSV
  return (separateur === ';' ? '\ufeff' : '') + lignes.join('\r\n');
}
