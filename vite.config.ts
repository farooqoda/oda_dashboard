import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The signed-out pages, served as real files. GitHub Pages has only index.html, so a direct visit to
 * /login used to be answered with HTTP 404 (public/404.html then bounced the browser back into the app).
 * People saw the page, but link checkers, search engines and app reviewers saw a 404. GitHub Pages serves
 * /login from login.html with HTTP 200 and no redirect, so the app is copied there; the router does the rest.
 * Keep this list in sync with the public <Route>s in src/App.tsx. Signed-in pages keep using 404.html.
 */
const PUBLIC_ROUTES = ['login', 'signup', 'reset-password'];

function publicRoutePages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'public-route-pages',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      for (const r of PUBLIC_ROUTES) copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, `${r}.html`));
    },
  };
}

export default defineConfig({
  // Served from the domain root (connect.impactinnovationhub.com), not a GitHub Pages
  // project subpath — '/' is also Vite's default, kept explicit here since
  // this value has to match <BrowserRouter basename> in src/main.tsx (which
  // reads it back via import.meta.env.BASE_URL) and the redirect target
  // baked into public/404.html for GitHub Pages' SPA-routing workaround.
  // Change all three together if this ever serves from a subpath again.
  base: '/',
  plugins: [react(), publicRoutePages()],
  server: {
    port: 5173,
  },
});
