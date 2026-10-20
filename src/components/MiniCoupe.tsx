import { useId } from 'react';
import { etatCoupe, geometrieTuyaux, largeurFouille, section } from '../calc/engine';
import { classeMateriau } from '../calc/projet';
import type { Regard, Reseau, Troncon } from '../calc/types';

interface Props {
  troncon: Troncon;
  amont: Regard;
  aval: Regard;
  reseaux: Reseau[];
}

/** Vignette à l'échelle de la coupe transversale au milieu du tronçon (sans cotes ni interaction) */
export function MiniCoupe({ troncon: t, amont, aval, reseaux }: Props) {
  // Identifiant utilisable dans url(#…) : on retire les caractères spéciaux de useId
  const base = `mini${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clip = `${base}-fouille`;
  const clipUtile = `${base}-utile`;
  const e = etatCoupe(t, amont, aval, 0.5);
  const H = Math.max(0.05, e.H);
  const f = t.type === 'V' ? Math.max(0, t.fruit) : 0;
  const W = t.largeur;
  const Wf = largeurFouille(t);
  const Wt = Wf + 2 * f * H;
  const sec = section(t, H, e.basTuyaux);
  const geoms = geometrieTuyaux(t, e.basTuyaux);

  // Repère en cm : x depuis l'axe, y depuis le terrain naturel vers le bas
  const k = 100;
  const marge = Math.max(0.15, 0.12 * Wt);
  const larg = Wt + 2 * marge;
  const haut = H + 0.12;
  const X = (x: number) => x * k;
  const Yy = (y: number) => (H - y) * k;
  const Yz = (z: number) => z * k;
  const hw = (z: number) => Wf / 2 + f * (H - z);
  const poly = (pts: number[][]) => pts.map((p) => p.join(',')).join(' ');
  const tranchee = poly([
    [X(-Wf / 2), Yy(0)],
    [X(Wf / 2), Yy(0)],
    [X(Wt / 2), Yy(H)],
    [X(-Wt / 2), Yy(H)],
  ]);
  const utile = poly([
    [X(-W / 2), Yy(0)],
    [X(W / 2), Yy(0)],
    [X(W / 2 + f * H), Yy(H)],
    [X(-W / 2 - f * H), Yy(H)],
  ]);
  const couleur = (id: string) => reseaux.find((r) => r.id === id)?.couleur ?? 'currentColor';

  return (
    <svg
      className="mini-coupe"
      viewBox={`${X(-larg / 2)} ${-0.04 * k} ${larg * k} ${haut * k}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <polygon points={tranchee} />
        </clipPath>
        <clipPath id={clipUtile}>
          <polygon points={utile} />
        </clipPath>
      </defs>
      <rect x={X(-larg / 2)} y={0} width={larg * k} height={(haut - 0.04) * k} className="sol" />
      <polygon points={tranchee} className="remblai" />
      <g clipPath={`url(#${clipUtile})`}>
        {geoms.map((g) => (
          <rect
            key={g.tuyau.id}
            x={X(g.bloc.x0)}
            y={Yy(Math.min(g.bloc.y1, H))}
            width={(g.bloc.x1 - g.bloc.x0) * k}
            height={Math.max(0, Math.min(g.bloc.y1, H) - g.bloc.y0) * k}
            className={`enrobage enr-${classeMateriau(g.tuyau.enrobage.materiau)}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g clipPath={`url(#${clip})`}>
        {sec.bornesCouches.map(([z1, z2], i) =>
          z2 > z1 ? (
            <polygon
              key={t.couches[i].id}
              points={poly([
                [X(-hw(z1)), Yz(z1)],
                [X(hw(z1)), Yz(z1)],
                [X(hw(z2)), Yz(z2)],
                [X(-hw(z2)), Yz(z2)],
              ])}
              className={`couche-${i % 6}`}
            />
          ) : null,
        )}
      </g>
      {Wf > W + 1e-9 &&
        [-1, 1].map((c) => (
          <rect key={c} x={c < 0 ? X(-Wf / 2) : X(W / 2)} y={Yy(H)} width={((Wf - W) / 2) * k} height={H * k} className="mini-blindage" />
        ))}
      <polygon points={tranchee} className="tranchee-contour" vectorEffect="non-scaling-stroke" />
      <line x1={X(-larg / 2)} x2={X(larg / 2)} y1={0} y2={0} className="sol-ligne" vectorEffect="non-scaling-stroke" />
      {geoms.map((g) => (
        <circle
          key={g.tuyau.id}
          cx={X(g.cx)}
          cy={Yy(g.cy)}
          r={g.r * k}
          fill="var(--c-tuyau-int)"
          stroke={couleur(g.tuyau.reseau)}
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
