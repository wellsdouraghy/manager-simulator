import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built dist/ works from any location — a root
  // domain, a subfolder, GitHub Pages, itch.io, a file:// preview, anywhere.
  base: './',
});
