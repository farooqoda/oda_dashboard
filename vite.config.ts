import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from the domain root (gab.fisolutionz.com), not a GitHub Pages
  // project subpath — '/' is also Vite's default, kept explicit here since
  // this value has to match <BrowserRouter basename> in src/main.tsx (which
  // reads it back via import.meta.env.BASE_URL) and the redirect target
  // baked into public/404.html for GitHub Pages' SPA-routing workaround.
  // Change all three together if this ever serves from a subpath again.
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
