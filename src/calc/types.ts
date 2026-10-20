// Modèle de données du module. Toutes les dimensions sont en mètres,
// les altitudes en m NGF, les volumes en m³.

export type TrenchType = 'U' | 'V';
export type SurfaceNature = 'terre' | 'enrobe';

export interface Regard {
  id: string;
  nom: string;
  /** Altitude du terrain naturel */
  tn: number;
  /** Altitude du fil d'eau projet */
  fe: number;
}

export interface Enrobage {
  bas: number;
  haut: number;
  gauche: number;
  droite: number;
}

export interface Tuyau {
  id: string;
  nom: string;
  /** Diamètre extérieur */
  diametre: number;
  /** Épaisseur de paroi : écart entre le fil d'eau (intérieur) et la génératrice inférieure extérieure */
  paroi: number;
  /** Position de l'axe du tuyau par rapport à l'axe de la tranchée (négatif = à gauche) */
  position: number;
  /**
   * Fil d'eau propre (altitudes aux regards amont et aval), pour un réseau posé à une
   * autre profondeur que celui des regards. null : suit le fil d'eau des regards.
   */
  filDEau: { amont: number; aval: number } | null;
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
  /** Largeur de tranchée en fond */
  largeur: number;
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

export interface Projet {
  nom: string;
  regards: Regard[];
  /** troncons[i] relie regards[i] à regards[i + 1] */
  troncons: Troncon[];
}
