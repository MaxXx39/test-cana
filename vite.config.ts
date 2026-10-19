import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Le build produit un unique fichier HTML autonome (dist/index.html),
// utilisable hors ligne en l'ouvrant directement dans un navigateur.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: {
    environment: 'node',
  },
});
