const cache = new Map<number, Intl.NumberFormat>();

/** Nombre au format français (virgule décimale, espace des milliers) */
export function fmt(n: number, decimales = 2): string {
  let f = cache.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    cache.set(decimales, f);
  }
  return f.format(Math.abs(n) < 1e-12 ? 0 : n);
}

/** Lecture d'un nombre saisi avec virgule ou point décimal */
export function lireNombre(texte: string): number | null {
  const t = texte.replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function arrondir(n: number, pas: number): number {
  return Math.round(n / pas) * pas;
}

export function telecharger(nomFichier: string, contenu: string, type: string): void {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
