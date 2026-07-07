import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative asset paths so the built dist/ works from any location — a root
  // domain, a subfolder, GitHub Pages, itch.io, a file:// preview, anywhere.
  base: './',
  build: {
    rollupOptions: {
      input: {
        // The game itself + the standalone read-only leaderboard page
        // (manager-simulator.com/leaderboard — GitHub Pages serves
        // leaderboard.html for the extensionless URL).
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        leaderboard: fileURLToPath(new URL('./leaderboard.html', import.meta.url)),
      },
    },
  },
});
