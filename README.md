# Calcul de tranchées et volumes de canalisations

Application web (React + TypeScript) qui calcule les volumes de terrassement et de
matériaux pour la pose de canalisations, à partir des altitudes relevées aux regards.
Elle produit les métrés tronçon par tronçon et en total global, avec la distinction
remblai réemployé / évacuation.

## Lancer

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests du moteur de calcul
npm run build    # produit dist/index.html, un fichier autonome utilisable hors ligne
```

## Utilisation

1. **Réseaux** (haut de la colonne de gauche) : déclarer les réseaux qui partagent la
   tranchée (EU, EP…), chacun avec sa couleur.
2. **Tracé** : saisir les regards dans l’ordre et la longueur de chaque tronçon. À chaque
   regard, une ligne par réseau : la case indique que le réseau part vers le regard
   suivant, puis viennent son fil d’eau (ou sa profondeur) et le diamètre du tuyau vers
   l’aval. Deux modes de saisie :
   - **TN + FE** : altitude du terrain naturel et fil d’eau de chaque réseau ;
   - **Profondeurs** : seulement la profondeur TN − fil d’eau de chaque réseau (les
     volumes ne dépendent que des profondeurs).
3. **Tronçon** : cliquer un tronçon (vignette de sa coupe dans le Tracé) pour régler la
   tranchée (largeur, automatique ou non, blindage en U), l’écart entre tuyaux, leur
   enrobage, la structure. La coupe transversale est dessinée à l’échelle, avec le regard
   amont à gauche et le regard aval à droite (un puits par réseau).
4. **Résultats** : volumes du tronçon à côté du formulaire, tableau de tous les tronçons
   et total global en bas de page. Export CSV (séparateur `;`, virgule décimale) et
   impression.

Le projet est sauvegardé automatiquement dans le navigateur ; « Enregistrer » / « Ouvrir »
échangent un fichier JSON.

## Hypothèses de calcul

Repère de la coupe : y = 0 au fond de fouille. Toutes les dimensions sont en mètres.

- **Plusieurs réseaux** : chaque tuyau appartient à un réseau, dont le fil d’eau est saisi
  à chaque regard. Les réseaux d’une même tranchée peuvent donc être à des profondeurs
  différentes. Les résultats donnent le linéaire de canalisation par réseau et diamètre.
- **Profondeur de fouille** : le fond, plat sur toute la largeur, est calé sous le réseau
  le plus profond : `fond = min(FE − paroi − enrobage bas)`, et `H = TN − fond`. Le réseau
  qui fixe le fond peut changer le long du tronçon ; le calcul est alors découpé au point
  de bascule.
- **Tranchée en U** : `largeur de fouille × hauteur moyenne × longueur`, où la largeur de
  fouille est la largeur utile plus l’épaisseur du blindage de chaque côté. Les tuyaux et
  leurs enrobages restent dans la largeur utile ; la place des panneaux, libérée au
  retrait, est comptée en remblai et en structure. Surface de blindage calculée sur les
  deux faces.
- **Écarts entre réseaux** : distance nu à nu (paroi à paroi) entre chaque tuyau et son
  voisin de gauche. En largeur automatique, les tuyaux sont centrés et la largeur utile
  est l’emprise de leurs enrobages.
- **Tranchée en V** : la largeur vaut `largeur fond + 2 × fruit × y`. La profondeur variant
  linéairement entre les regards, le volume est intégré exactement :
  `L × (l·Hm + fruit·(H1² + H1·H2 + H2²)/3)` (sur chaque morceau où H est affine).
- **Enrobage** : bloc défini par les quatre épaisseurs autour de chaque tuyau, à partir
  de son propre lit de pose, moins la section du tuyau. Sous un réseau plus haut, l’espace
  est compté en remblai. Les blocs sont rognés aux parois de
  la tranchée et leurs recouvrements ne sont comptés qu’une fois.
- **Structure** : les couches s’empilent depuis la surface avec leur épaisseur propre, sur
  la largeur réelle de la tranchée à leur niveau. Elles sont écrêtées si elles atteignent
  l’enrobage (une alerte le signale).
- **Remblai** : comble l’espace restant entre l’enrobage et la structure (hauteur variable).
- **Décapage** : bande de surface d’épaisseur propre, sur la largeur en tête. Le déblai est
  compté hors décapage pour ne pas compter deux fois le même volume.
- **Réutilisation / foisonnement** : pour le déblai et le décapage de chaque tronçon,
  « réutilisé en remblai » range le volume en réemploi (sinon en évacuation) et
  « foisonnement » lui applique le coefficient saisi. Le remblai d’apport est le besoin en
  remblai moins les volumes réemployés, comparés en place ; au total global, les excédents
  d’un tronçon compensent les autres.

Pour un environnement qui bloque téléchargements et impression (page intégrée),
`VITE_SANS_FICHIERS=1 npm run build` masque « Enregistrer », « Export CSV » et
« Imprimer » ; « Copier pour tableur » reste disponible.
