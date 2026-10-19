import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { calageSousFilDEau, geometrieTuyaux, section } from '../calc/engine';
import type { Regard, Troncon, Tuyau } from '../calc/types';
import { arrondir, fmt } from '../utils/format';

export type ModeCoupe = 'amont' | 'moyenne' | 'aval';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  mode: ModeCoupe;
  onChange: (t: Troncon) => void;
  selection: string | null;
  onSelect: (id: string | null) => void;
}

type Poignee =
  | { k: 'largeur' }
  | { k: 'fruit' }
  | { k: 'decapage' }
  | { k: 'position'; id: string }
  | { k: 'enrobage'; id: string; cote: 'gauche' | 'droite' | 'haut' | 'bas' }
  | { k: 'couche'; index: number };

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
    ? { vbw, compact, jauge: 66, cote: 40, etiq: 0, hauteurUtile: 340 }
    : { vbw, compact, jauge: 128, cote: 64, etiq: 200, hauteurUtile: 420 };
}

const PAD = 8;
const TOP = 64;
const BAS = 64;

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

export function CoupeTransversale({ troncon: t, amont, aval, mode, onChange, selection, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
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
  const drag = useRef<Poignee | null>(null);
  const [gel, setGel] = useState<(Mise & { vbw: number }) | null>(null);

  const calage = calageSousFilDEau(t);
  const D1 = amont.tn - amont.fe;
  const D2 = aval.tn - aval.fe;
  const D = mode === 'amont' ? D1 : mode === 'aval' ? D2 : (D1 + D2) / 2;
  const H = Math.max(0.05, D + calage);
  const H1 = D1 + calage;
  const H2 = D2 + calage;
  const f = t.type === 'V' ? Math.max(0, t.fruit) : 0;
  const W = t.largeur;
  const sec = useMemo(() => section(t, H), [t, H]);
  const geoms = useMemo(() => geometrieTuyaux(t), [t]);
  const Wt = W + 2 * f * H;

  const largeurMonde = Math.max(Wt, ...geoms.map((g) => 2 * Math.max(Math.abs(g.bloc.x0), Math.abs(g.bloc.x1)))) * 1.3 + 0.3;
  const profondeurMax = Math.max(H1, H2, H, 0.5) + 0.25;
  const calcul = miseEnPage(gab, largeurMonde, profondeurMax);
  const m = gel ?? calcul;
  const { s, cx } = m;
  const vbh = Math.max(m.vbh, calcul.vbh);

  const X = (x: number) => cx + x * s;
  /** depuis une profondeur sous TN */
  const Yz = (z: number) => TOP + z * s;
  /** depuis une hauteur au-dessus du fond */
  const Yy = (y: number) => TOP + (H - y) * s;
  const hw = (z: number) => W / 2 + f * (H - z);

  const tranchee = [
    [X(-W / 2), Yy(0)],
    [X(W / 2), Yy(0)],
    [X(W / 2 + f * H), Yy(H)],
    [X(-W / 2 - f * H), Yy(H)],
  ]
    .map((p) => p.join(','))
    .join(' ');

  const bande = (z1: number, z2: number) =>
    [
      [X(-hw(z1)), Yz(z1)],
      [X(hw(z1)), Yz(z1)],
      [X(hw(z2)), Yz(z2)],
      [X(-hw(z2)), Yz(z2)],
    ]
      .map((p) => p.join(','))
      .join(' ');

  // ----- Interaction -----
  const versMonde = (e: ReactPointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: (p.x - cx) / s, z: (p.y - TOP) / s };
  };

  const majTuyau = (id: string, maj: (p: Tuyau) => Tuyau) =>
    onChange({ ...t, tuyaux: t.tuyaux.map((p) => (p.id === id ? maj(p) : p)) });

  const surDeplacement = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, z } = versMonde(e);
    const y = H - z;
    const cmArrondi = (v: number) => Math.max(0, arrondir(v, 0.01));
    switch (d.k) {
      case 'largeur':
        onChange({ ...t, largeur: Math.max(0.1, arrondir(2 * Math.abs(x), 0.01)) });
        break;
      case 'fruit':
        onChange({ ...t, fruit: Math.max(0, arrondir((Math.abs(x) - W / 2) / H, 0.05)) });
        break;
      case 'decapage':
        onChange({ ...t, decapage: { ...t.decapage, epaisseur: Math.max(0.01, Math.min(H, arrondir(z, 0.01))) } });
        break;
      case 'position':
        majTuyau(d.id, (p) => ({ ...p, position: arrondir(x, 0.01) }));
        break;
      case 'enrobage': {
        const g = geoms.find((q) => q.tuyau.id === d.id);
        if (!g) return;
        majTuyau(d.id, (p) => {
          const e2 = { ...p.enrobage };
          if (d.cote === 'gauche') e2.gauche = cmArrondi(g.cx - g.r - x);
          if (d.cote === 'droite') e2.droite = cmArrondi(x - g.cx - g.r);
          if (d.cote === 'haut') e2.haut = cmArrondi(y - (g.cy + g.r));
          if (d.cote === 'bas') e2.bas = cmArrondi(z - D - p.paroi);
          return { ...p, enrobage: e2 };
        });
        break;
      }
      case 'couche': {
        const debut = t.couches.slice(0, d.index).reduce((a, c) => a + c.epaisseur, 0);
        const couches = t.couches.map((c, i) => (i === d.index ? { ...c, epaisseur: Math.max(0.01, arrondir(z - debut, 0.01)) } : c));
        onChange({ ...t, couches });
        break;
      }
    }
  };

  const demarrer = (p: Poignee) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = p;
    setGel({ ...calcul, vbw: VBW });
    if (p.k === 'position' || p.k === 'enrobage') onSelect(p.id);
  };

  const terminer = () => {
    drag.current = null;
    setGel(null);
  };

  const poignee = (p: Poignee, px: number, py: number, titre: string, forme: 'h' | 'v' | 'hv' = 'h') => (
    <g className={`poignee poignee-${forme}`} onPointerDown={demarrer(p)}>
      <title>{titre}</title>
      <circle cx={px} cy={py} r={14} className="poignee-zone" />
      <circle cx={px} cy={py} r={6} className="poignee-point" />
    </g>
  );

  // ----- Étiquettes -----
  const etiquettes: { y: number; ancreX: number; ancreY: number; texte: string; classe: string }[] = [];
  if (t.decapage.actif) {
    const e = Math.min(t.decapage.epaisseur, H);
    etiquettes.push({
      y: Yz(e / 2),
      ancreX: X(hw(e / 2)),
      ancreY: Yz(e / 2),
      texte: `Décapage ${t.surface === 'enrobe' ? 'enrobé' : 'terre'} · ${cm(t.decapage.epaisseur)} cm`,
      classe: 'et-decapage',
    });
  }
  sec.bornesCouches.forEach(([z1, z2], i) => {
    if (z2 <= z1) return;
    const zm = (z1 + z2) / 2;
    etiquettes.push({
      y: Yz(zm),
      ancreX: X(hw(zm)),
      ancreY: Yz(zm),
      texte: `${t.couches[i].nom} · ${cm(t.couches[i].epaisseur)} cm`,
      classe: `et-couche-${i % 6}`,
    });
  });
  const zBasStructure = sec.bornesCouches.length ? Math.max(...sec.bornesCouches.map((b) => b[1])) : 0;
  const zHautEnrobage = H - sec.hautEnrobage;
  if (zHautEnrobage - zBasStructure > 0.005) {
    const zm = (zBasStructure + zHautEnrobage) / 2;
    etiquettes.push({
      y: Yz(zm),
      ancreX: X(hw(zm)),
      ancreY: Yz(zm),
      texte: `${t.remblaiNom} · ${cm(zHautEnrobage - zBasStructure)} cm`,
      classe: 'et-remblai',
    });
  }
  if (geoms.length) {
    const ym = sec.hautEnrobage / 2;
    const droite = Math.max(...geoms.map((g) => g.bloc.x1));
    etiquettes.push({
      y: Yy(ym),
      ancreX: X(Math.min(droite, hw(H - ym))),
      ancreY: Yy(ym),
      texte: `Enrobage · ${fmt(sec.enrobage, 3)} m²/ml`,
      classe: 'et-enrobage',
    });
  }
  etiquettes.sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiquettes.length; i++) {
    if (etiquettes[i].y < etiquettes[i - 1].y + 17) etiquettes[i].y = etiquettes[i - 1].y + 17;
  }

  const echelle = barreEchelle(s);
  const surfaceEp = Math.max(0.04, t.decapage.actif ? t.decapage.epaisseur : 0.05);
  const xG0 = m.xSection0 - 8;
  const xG1 = m.xSection1 + 8;

  const jauge = (r: Regard, Hr: number, x0: number, titre: string, actif: boolean) => {
    const Dr = r.tn - r.fe;
    const xc = x0 + JAUGE / 2;
    const lp = gab.compact ? 30 : 58;
    const yFe = Math.max(Yz(Math.max(0, Dr)) + 22, Hr > Dr ? Yz(Hr) + 16 : 0);
    return (
      <g className={`jauge ${actif ? 'jauge-active' : ''} ${gab.compact ? 'jauge-compacte' : ''}`}>
        <text x={xc} y={20} className="jauge-titre" textAnchor="middle">
          {gab.compact ? titre.replace('Regard ', '') : titre}
        </text>
        <text x={xc} y={38} className="jauge-nom" textAnchor="middle">
          {r.nom || '—'}
        </text>
        <line x1={x0 + 4} x2={x0 + JAUGE - 4} y1={Yz(0)} y2={Yz(0)} className="sol-ligne" />
        <rect x={xc - lp / 2} y={Yz(0)} width={lp} height={Math.max(0, Dr) * s} className="jauge-puits" />
        <rect x={xc - lp / 2 - 5} y={Yz(Math.max(0, Dr))} width={lp + 10} height={7} className="jauge-radier" />
        {Hr > Dr && (
          <line x1={xc - lp / 2 - 12} x2={xc + lp / 2 + 12} y1={Yz(Hr)} y2={Yz(Hr)} className="jauge-fond" />
        )}
        <text x={xc} y={Yz(0) - 6} className="jauge-alt" textAnchor="middle">
          TN {fmt(r.tn, 2)}
        </text>
        <text x={xc} y={yFe} className="jauge-alt" textAnchor="middle">
          FE {fmt(r.fe, 2)}
        </text>
        <text
          x={xc}
          y={Yz(Math.max(0, Dr) / 2) + 4}
          className="jauge-prof"
          textAnchor="middle"
          transform={gab.compact ? `rotate(-90 ${xc} ${Yz(Math.max(0, Dr) / 2) + 4})` : undefined}
        >
          {fmt(Dr, 2)} m
        </text>
        {Hr > Dr && (
          <text x={xc} y={yFe + 15} className="jauge-fouille" textAnchor="middle">
            fouille {fmt(Hr, 2)} m
          </text>
        )}
      </g>
    );
  };

  const selectionne = geoms.find((g) => g.tuyau.id === selection);

  return (
    <div ref={boiteRef} className="coupe-boite">
    <svg
      ref={svgRef}
      className="coupe"
      viewBox={`0 0 ${gel?.vbw ?? VBW} ${vbh}`}
      role="img"
      aria-label="Coupe transversale de la tranchée"
      onPointerMove={surDeplacement}
      onPointerUp={terminer}
      onPointerCancel={terminer}
      onPointerDown={() => onSelect(null)}
    >
      <defs>
        <clipPath id="clip-tranchee">
          <polygon points={tranchee} />
        </clipPath>
        <pattern id="hachures-sol" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" className="hachure" />
        </pattern>
      </defs>

      {jauge(amont, H1, PAD, 'Regard amont', mode === 'amont')}
      {jauge(aval, H2, VBW - PAD - JAUGE, 'Regard aval', mode === 'aval')}

      {/* Terrain encaissant */}
      <rect x={xG0} y={Yz(0)} width={xG1 - xG0} height={(profondeurMax - 0.02) * s} className="sol" />
      <rect x={xG0} y={Yz(0)} width={xG1 - xG0} height={(profondeurMax - 0.02) * s} fill="url(#hachures-sol)" />
      <rect
        x={xG0}
        y={Yz(0)}
        width={xG1 - xG0}
        height={surfaceEp * s}
        className={t.surface === 'enrobe' ? 'surface-enrobe' : 'surface-terre'}
      />

      {/* Tranchée */}
      <polygon points={tranchee} className="remblai" />
      <g clipPath="url(#clip-tranchee)">
        {geoms.map((g) => (
          <rect
            key={g.tuyau.id}
            x={X(g.bloc.x0)}
            y={Yy(Math.min(g.bloc.y1, H))}
            width={(g.bloc.x1 - g.bloc.x0) * s}
            height={(Math.min(g.bloc.y1, H) - g.bloc.y0) * s}
            className={`enrobage ${g.tuyau.id === selection ? 'enrobage-sel' : ''}`}
          />
        ))}
        {sec.bornesCouches.map(([z1, z2], i) =>
          z2 > z1 ? <polygon key={t.couches[i].id} points={bande(z1, z2)} className={`couche couche-${i % 6}`} /> : null,
        )}
      </g>
      <polygon points={tranchee} className="tranchee-contour" />
      {t.type === 'U' && (
        <>
          <line x1={X(-W / 2) - 3} x2={X(-W / 2) - 3} y1={Yy(0)} y2={Yy(H)} className="blindage" />
          <line x1={X(W / 2) + 3} x2={X(W / 2) + 3} y1={Yy(0)} y2={Yy(H)} className="blindage" />
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
      <line x1={xG0} x2={xG1} y1={Yz(0)} y2={Yz(0)} className="sol-ligne" />

      {/* Tuyaux */}
      {geoms.map((g) => (
        <g
          key={g.tuyau.id}
          className={`tuyau ${g.tuyau.id === selection ? 'tuyau-sel' : ''}`}
          onPointerDown={demarrer({ k: 'position', id: g.tuyau.id })}
        >
          <title>{`${g.tuyau.nom} — Ø ${fmt(g.tuyau.diametre * 1000, 0)} mm (glisser pour déplacer)`}</title>
          <circle cx={X(g.cx)} cy={Yy(g.cy)} r={g.r * s} className="tuyau-paroi" />
          <circle cx={X(g.cx)} cy={Yy(g.cy)} r={Math.max(0, g.r - Math.max(g.tuyau.paroi, 0.004)) * s} className="tuyau-int" />
          {g.r * s > 18 && (
            <text x={X(g.cx)} y={Yy(g.cy) + 4} textAnchor="middle" className="tuyau-texte">
              Ø{fmt(g.tuyau.diametre * 1000, 0)}
            </text>
          )}
        </g>
      ))}

      {/* Fil d'eau */}
      <line x1={X(-hw(H - calage)) - 16} x2={X(0)} y1={Yy(calage)} y2={Yy(calage)} className="ligne-fe" />
      <text x={X(-hw(H - calage)) - 18} y={Yy(calage) + 4} textAnchor="end" className="cote-texte">
        FE
      </text>

      {/* Cotes */}
      <g className="cote">
        <line x1={X(-Wt / 2) - 44} x2={X(-Wt / 2) - 44} y1={Yz(0)} y2={Yz(H)} />
        <line x1={X(-Wt / 2) - 50} x2={X(-Wt / 2) - 38} y1={Yz(0)} y2={Yz(0)} />
        <line x1={X(-Wt / 2) - 50} x2={X(-W / 2)} y1={Yz(H)} y2={Yz(H)} />
        <text
          x={X(-Wt / 2) - 50}
          y={Yz(H / 2)}
          transform={`rotate(-90 ${X(-Wt / 2) - 50} ${Yz(H / 2)})`}
          textAnchor="middle"
          className="cote-texte"
        >
          H = {fmt(H, 2)} m
        </text>
        <line x1={X(-W / 2)} x2={X(W / 2)} y1={Yy(0) + 22} y2={Yy(0) + 22} />
        <line x1={X(-W / 2)} x2={X(-W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 28} />
        <line x1={X(W / 2)} x2={X(W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 28} />
        <text x={X(0)} y={Yy(0) + 42} textAnchor="middle" className="cote-texte">
          {fmt(W, 2)} m
        </text>
        {t.type === 'V' && (
          <>
            <line x1={X(-Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 18} y2={Yz(0) - 18} />
            <line x1={X(-Wt / 2)} x2={X(-Wt / 2)} y1={Yz(0) - 24} y2={Yz(0) - 4} />
            <line x1={X(Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 24} y2={Yz(0) - 4} />
            <text x={X(0)} y={Yz(0) - 24} textAnchor="middle" className="cote-texte">
              {fmt(Wt, 2)} m en tête · fruit {fmt(f, 2)}
            </text>
          </>
        )}
      </g>

      {/* Étiquettes */}
      {!gab.compact && etiquettes.map((e, i) => (
        <g key={i} className={`etiquette ${e.classe}`}>
          <polyline points={`${e.ancreX - 4},${e.ancreY} ${m.xEtiquettes - 6},${e.y} ${m.xEtiquettes},${e.y}`} className="etiquette-trait" />
          <circle cx={e.ancreX - 4} cy={e.ancreY} r={2} className="etiquette-point" />
          <text x={m.xEtiquettes + 4} y={e.y + 4} className="etiquette-texte">
            {e.texte}
          </text>
        </g>
      ))}

      {/* Échelle */}
      <g className="echelle">
        <rect x={m.xSection0} y={vbh - 24} width={echelle * s} height={5} />
        <text x={m.xSection0} y={vbh - 30} className="cote-texte">
          {echelle >= 1 ? `${fmt(echelle, 0)} m` : `${fmt(echelle * 100, 0)} cm`}
        </text>
      </g>

      {/* Poignées */}
      {poignee({ k: 'largeur' }, X(W / 2), Yy(0), 'Largeur de tranchée en fond (glisser)')}
      {t.type === 'V' && poignee({ k: 'fruit' }, X(W / 2 + f * H), Yy(H), 'Pente de talus (glisser)')}
      {t.decapage.actif &&
        poignee({ k: 'decapage' }, X(hw(t.decapage.epaisseur) * 0.55), Yz(Math.min(t.decapage.epaisseur, H)), 'Épaisseur de décapage (glisser)', 'v')}
      {sec.bornesCouches.map(([, z2], i) => {
        const zBrut = t.couches.slice(0, i + 1).reduce((a, c) => a + c.epaisseur, 0);
        if (zBrut > z2 + 1e-9) return null;
        return <g key={t.couches[i].id}>{poignee({ k: 'couche', index: i }, X(-hw(z2) * 0.55), Yz(z2), `Épaisseur « ${t.couches[i].nom} » (glisser)`, 'v')}</g>;
      })}
      {selectionne && (
        <>
          {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'gauche' }, X(selectionne.bloc.x0), Yy(selectionne.cy), 'Enrobage gauche (glisser)')}
          {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'droite' }, X(selectionne.bloc.x1), Yy(selectionne.cy), 'Enrobage droit (glisser)')}
          {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'haut' }, X(selectionne.cx), Yy(Math.min(selectionne.bloc.y1, H)), 'Enrobage haut (glisser)', 'v')}
          {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'bas' }, X(selectionne.cx), Yy(0), 'Enrobage bas / lit de pose (glisser)', 'v')}
        </>
      )}
    </svg>
      {gab.compact && (
        <ul className="legende">
          {etiquettes.map((e, i) => (
            <li key={i} className={e.classe}>
              {e.texte}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
