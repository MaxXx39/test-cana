// Modèle de données du module. Toutes les dimensions sont en mètres,
// les altitudes en m NGF, les volumes en m³.

export type TrenchType = 'U' | 'V';
export type SurfaceNature = 'terre' | 'enrobe';

/** Réseau posé dans la tranchée (EU, EP, AEP…). Plusieurs réseaux peuvent cohabiter. */
export interface Reseau {
  id: string;
  nom: string;
  couleur: string;
  /** Enrobage des tuyaux du réseau, commun à tous ses tronçons */
  enrobage: Enrobage;
}

export interface Regard {
  id: string;
  nom: string;
  /** Altitude du terrain naturel */
  tn: number;
  /** Altitude du fil d'eau projet, pour chaque réseau (clé : id du réseau) */
  fe: Record<string, number>;
}

export interface Enrobage {
  bas: number;
  haut: number;
  gauche: number;
  droite: number;
}

export interface Tuyau {
  id: string;
  /** Réseau auquel appartient le tuyau : son fil d'eau est celui du réseau aux regards */
  reseau: string;
  /** Diamètre extérieur */
  diametre: number;
  /** Épaisseur de paroi : écart entre le fil d'eau (intérieur) et la génératrice inférieure extérieure */
  paroi: number;
  /** Position de l'axe du tuyau par rapport à l'axe de la tranchée (négatif = à gauche) */
  position: number;
  /** Copie de l'enrobage du réseau, tenue à jour par majReseau */
  enrobage: Enrobage;
}

export interface Couche {
  id: string;
  nom: string;
  epaisseur: number;
}

/** Options appliquées à un volume de matériau extrait */
export interface OptionsMateriau {
  /** Coché : compté en remblai réemployé ; sinon en évacuation */
  reutilise: boolean;
  /** Coché : le coefficient de foisonnement est appliqué */
  foisonnement: boolean;
  coefficient: number;
}

export interface Troncon {
  id: string;
  /** Longueur du tronçon entre les deux regards */
  longueur: number;
  type: TrenchType;
  /** Largeur utile de tranchée en fond (entre blindages pour une tranchée en U) */
  largeur: number;
  /** Largeur ajustée automatiquement aux tuyaux (enrobages et écarts), tuyaux centrés */
  largeurAuto: boolean;
  /** Tranchée en U : épaisseur du blindage de chaque côté, qui s'ajoute à la largeur de fouille */
  blindage: number;
  /** Pente de talus (type V) : fruit horizontal / vertical, par côté */
  fruit: number;
  surface: SurfaceNature;
  decapage: { actif: boolean; epaisseur: number };
  tuyaux: Tuyau[];
  /** Couches de structure, de la surface vers le bas */
  couches: Couche[];
  /** Nom du remblai qui comble l'espace entre l'enrobage et la structure */
  remblaiNom: string;
  optionsDeblai: OptionsMateriau;
  optionsDecapage: OptionsMateriau;
}

/** Saisie des regards : altitudes TN et fil d'eau, ou seulement les profondeurs TN − FE */
export type ModeSaisie = 'altitudes' | 'profondeurs';

export interface Projet {
  nom: string;
  saisie: ModeSaisie;
  /** Au moins un réseau */
  reseaux: Reseau[];
  regards: Regard[];
  /** troncons[i] relie regards[i] à regards[i + 1] */
  troncons: Troncon[];
}
