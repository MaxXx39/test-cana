import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { etatCoupe, filDEauRegard, filDEauTuyau, geometrieTuyaux, section } from '../calc/engine';
import type { ModeSaisie, Regard, Reseau, Troncon, Tuyau } from '../calc/types';
import { arrondir, fmt } from '../utils/format';

export type ModeCoupe = 'amont' | 'moyenne' | 'aval';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  reseaux: Reseau[];
  /** En saisie par profondeurs, les altitudes ne sont pas affichées */
  saisie: ModeSaisie;
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
    ? { vbw, compact, jauge: 70, cote: 40, etiq: 0, hauteurUtile: 340 }
    : { vbw, compact, jauge: 150, cote: 60, etiq: 230, hauteurUtile: 420 };
}

const PAD = 8;
const TOP = 70;
const BAS = 56;
const PAS_ETIQUETTE = 18;

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
  texte: string;
  /** Classe du matériau, pour la pastille */
  classe: string;
}

export function CoupeTransversale({ troncon: t, amont, aval, reseaux, saisie, mode, onChange, selection, onSelect }: Props) {
  const altitudes = saisie === 'altitudes';
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
  const Wt = W + 2 * f * H;

  const profRegards = [amont, aval].flatMap((r) => reseauxRegard.map((x) => r.tn - filDEauRegard(r, x.id)));
  const largeurMonde = Math.max(Wt, ...geoms.map((g) => 2 * Math.max(Math.abs(g.bloc.x0), Math.abs(g.bloc.x1)))) * 1.25 + 0.3;
  const profondeurMax = Math.max(H1, H2, H, 0.5, ...profRegards) + 0.25;
  const calcul = miseEnPage(gab, largeurMonde, profondeurMax);
  const m = gel ?? calcul;
  const { s, cx } = m;

  const X = (x: number) => cx + x * s;
  /** depuis une profondeur sous TN */
  const Yz = (z: number) => TOP + z * s;
  /** depuis une hauteur au-dessus du fond */
  const Yy = (y: number) => TOP + (H - y) * s;
  const hw = (z: number) => W / 2 + f * (H - z);

  const LIGNE_FE = 14;
  const basJauges =
    Math.max(...[amont, aval].map((r, k) => Math.max(...reseauxRegard.map((x) => Yz(Math.max(0, r.tn - filDEauRegard(r, x.id))) + 6), Yz(k ? H2 : H1)))) +
    16 +
    reseauxRegard.length * LIGNE_FE +
    (gab.compact ? 4 : 20);
  const vbh = Math.max(m.vbh, calcul.vbh, basJauges);

  const poly = (pts: number[][]) => pts.map((p) => p.join(',')).join(' ');
  const tranchee = poly([
    [X(-W / 2), Yy(0)],
    [X(W / 2), Yy(0)],
    [X(W / 2 + f * H), Yy(H)],
    [X(-W / 2 - f * H), Yy(H)],
  ]);
  const bande = (z1: number, z2: number) =>
    poly([
      [X(-hw(z1)), Yz(z1)],
      [X(hw(z1)), Yz(z1)],
      [X(hw(z2)), Yz(z2)],
      [X(-hw(z2)), Yz(z2)],
    ]);

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
          if (d.cote === 'bas') e2.bas = cmArrondi(z - (tn - filDEauTuyau(p, amont, aval, u)) - p.paroi);
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

  /** Poignée : un rond pour les cotes horizontales, une barrette pour les épaisseurs */
  const poignee = (p: Poignee, px: number, py: number, titre: string, sens: 'h' | 'v' = 'h', active = false) => (
    <g className={`poignee poignee-${sens} ${active ? 'poignee-active' : ''}`} onPointerDown={demarrer(p)}>
      <title>{titre}</title>
      <circle cx={px} cy={py} r={14} className="poignee-zone" />
      {sens === 'v' ? (
        <rect x={px - 9} y={py - 3.5} width={18} height={7} rx={3.5} className="poignee-point" />
      ) : (
        <circle cx={px} cy={py} r={5.5} className="poignee-point" />
      )}
    </g>
  );

  // ----- Étiquettes -----
  const etiquettes: Etiquette[] = [];
  const zVers = (z: number) => ({ y: Yz(z), ancreX: X(hw(z)), ancreY: Yz(z) });
  if (t.decapage.actif) {
    const e = Math.min(t.decapage.epaisseur, H);
    etiquettes.push({
      ...zVers(e / 2),
      texte: `Décapage ${t.surface === 'enrobe' ? 'enrobé' : 'terre'} · ${cm(t.decapage.epaisseur)} cm`,
      classe: 'et-decapage',
    });
  }
  sec.bornesCouches.forEach(([z1, z2], i) => {
    if (z2 <= z1) return;
    etiquettes.push({ ...zVers((z1 + z2) / 2), texte: `${t.couches[i].nom} · ${cm(t.couches[i].epaisseur)} cm`, classe: `et-couche-${i % 6}` });
  });
  const zBasStructure = sec.bornesCouches.length ? Math.max(...sec.bornesCouches.map((b) => b[1])) : 0;
  const zHautEnrobage = H - sec.hautEnrobage;
  if (zHautEnrobage - zBasStructure > 0.005) {
    etiquettes.push({
      ...zVers((zBasStructure + zHautEnrobage) / 2),
      texte: `${t.remblaiNom} · ${cm(zHautEnrobage - zBasStructure)} cm`,
      classe: 'et-remblai',
    });
  }
  // Les tuyaux portent leur nom sur le dessin ; leur détail est listé sous la coupe, de gauche à droite.
  const tuyauxListe = [...geoms].sort((a, b) => a.cx - b.cx);
  if (geoms.length) {
    const ym = Math.min(...geoms.map((g) => g.bloc.y0)) + 0.03;
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

  const selectionne = geoms.find((g) => g.tuyau.id === selection);

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
        <g clipPath="url(#clip-tranchee)">
          {geoms.map((g) => (
            <rect
              key={g.tuyau.id}
              x={X(g.bloc.x0)}
              y={Yy(Math.min(g.bloc.y1, H))}
              width={(g.bloc.x1 - g.bloc.x0) * s}
              height={Math.max(0, Math.min(g.bloc.y1, H) - g.bloc.y0) * s}
              className={`enrobage ${g.tuyau.id === selection ? 'enrobage-sel' : ''}`}
            />
          ))}
          {geoms.map((g) => (
            <rect
              key={`grain-${g.tuyau.id}`}
              x={X(g.bloc.x0)}
              y={Yy(Math.min(g.bloc.y1, H))}
              width={(g.bloc.x1 - g.bloc.x0) * s}
              height={Math.max(0, Math.min(g.bloc.y1, H) - g.bloc.y0) * s}
              fill="url(#sable)"
              pointerEvents="none"
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

        {/* Tuyaux, à la couleur de leur réseau */}
        {geoms.map((g) => {
          const ep = Math.max(3, g.tuyau.paroi * s);
          const sel = g.tuyau.id === selection;
          return (
            <g
              key={g.tuyau.id}
              className={`tuyau ${sel ? 'tuyau-sel' : ''}`}
              style={{ color: couleur(g.tuyau.reseau) }}
              onPointerDown={demarrer({ k: 'position', id: g.tuyau.id })}
            >
              <title>{`${reseau(g.tuyau.reseau)?.nom ?? ''} Ø${fmt(g.tuyau.diametre * 1000, 0)} — glisser pour déplacer`}</title>
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
          <line x1={X(-W / 2)} x2={X(W / 2)} y1={Yy(0) + 20} y2={Yy(0) + 20} />
          <line x1={X(-W / 2)} x2={X(-W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 26} />
          <line x1={X(W / 2)} x2={X(W / 2)} y1={Yy(0) + 4} y2={Yy(0) + 26} />
          <text x={X(0)} y={Yy(0) + 38} textAnchor="middle" className="cote-texte">
            {fmt(W, 2)} m
          </text>
          {t.type === 'V' && (
            <>
              <line x1={X(-Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 16} y2={Yz(0) - 16} />
              <line x1={X(-Wt / 2)} x2={X(-Wt / 2)} y1={Yz(0) - 22} y2={Yz(0) - 4} />
              <line x1={X(Wt / 2)} x2={X(Wt / 2)} y1={Yz(0) - 22} y2={Yz(0) - 4} />
              <text x={X(0)} y={Yz(0) - 22} textAnchor="middle" className="cote-texte">
                {fmt(Wt, 2)} m en tête · fruit {fmt(f, 2)}
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
              <text x={m.xEtiquettes + 16} y={e.y + 4} className="etiquette-texte">
                {e.texte}
              </text>
            </g>
          ))}

        {/* Échelle */}
        <g className="echelle">
          <rect x={m.xSection0} y={vbh - 22} width={echelle * s} height={4} />
          <text x={m.xSection0} y={vbh - 28} className="cote-texte">
            {echelle >= 1 ? `${fmt(echelle, 0)} m` : `${fmt(echelle * 100, 0)} cm`}
          </text>
        </g>

        {/* Poignées */}
        {poignee({ k: 'largeur' }, X(W / 2), Yy(0), 'Largeur de tranchée en fond (glisser)')}
        {t.type === 'V' && poignee({ k: 'fruit' }, X(W / 2 + f * H), Yy(H), 'Pente de talus (glisser)')}
        {t.decapage.actif &&
          poignee({ k: 'decapage' }, X(hw(t.decapage.epaisseur)) - 16, Yz(Math.min(t.decapage.epaisseur, H)), 'Épaisseur de décapage (glisser)', 'v')}
        {sec.bornesCouches.map(([, z2], i) => {
          const zBrut = t.couches.slice(0, i + 1).reduce((a, c) => a + c.epaisseur, 0);
          if (zBrut > z2 + 1e-9) return null;
          return <g key={t.couches[i].id}>{poignee({ k: 'couche', index: i }, X(-hw(z2)) + 16, Yz(z2), `Épaisseur « ${t.couches[i].nom} » (glisser)`, 'v')}</g>;
        })}
        {selectionne && (
          <>
            {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'gauche' }, X(selectionne.bloc.x0), Yy(selectionne.cy), 'Enrobage gauche (glisser)', 'h', true)}
            {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'droite' }, X(selectionne.bloc.x1), Yy(selectionne.cy), 'Enrobage droit (glisser)', 'h', true)}
            {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'haut' }, X(selectionne.cx), Yy(Math.min(selectionne.bloc.y1, H)), 'Enrobage haut (glisser)', 'v', true)}
            {poignee({ k: 'enrobage', id: selectionne.tuyau.id, cote: 'bas' }, X(selectionne.cx), Yy(selectionne.bloc.y0), 'Enrobage bas / lit de pose (glisser)', 'v', true)}
          </>
        )}
      </svg>
      {tuyauxListe.length > 0 && (
        <ul className="liste-reseaux-coupe" aria-label="Tuyaux de la coupe, de gauche à droite">
          {tuyauxListe.map((g) => {
            const fe = filDEauTuyau(g.tuyau, amont, aval, u);
            return (
              <li key={g.tuyau.id}>
                <button
                  type="button"
                  className={g.tuyau.id === selection ? 'actif' : ''}
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
