/** @type {import('tailwindcss').Config} */
// Colour names map to variables in src/theme.css (light + dark). Families and shades: scripts/gen-theme.mjs.
const FAMILIES = ['red', 'amber', 'emerald', 'sky', 'green', 'yellow', 'blue', 'orange', 'cyan', 'indigo', 'lime', 'pink', 'teal', 'violet', 'gray', 'rose', 'purple'];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const CUSTOM = {
  slate: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  brand: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  ink: ['DEFAULT', 800, 700, 300, 200],
  sun: [50, 100, 300, 400, 500],
  lead: [50, 500, 600, 700, 800],
};
const SINGLE = ['white', 'canvas', 'line', 'good', 'warning', 'critical'];
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
function themeColors() {
  const c = {};
  for (const [fam, shades] of Object.entries(CUSTOM)) {
    c[fam] = {};
    for (const s of shades) c[fam][s] = ref(s === 'DEFAULT' ? fam : `${fam}-${s}`);
  }
  for (const fam of FAMILIES) {
    c[fam] = {};
    for (const s of SHADES) c[fam][s] = ref(`${fam}-${s}`);
  }
  for (const n of SINGLE) c[n] = ref(n);
  return c;
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Impact Connect: one face (Urbanist) for headings and data alike.
        display: ['"Urbanist Variable"', 'Urbanist', 'system-ui', 'sans-serif'],
        sans: ['"Urbanist Variable"', 'Urbanist', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      // Every colour is a CSS variable (src/theme.css) so the dark theme can swap them all at once.
      colors: themeColors(),
      borderRadius: {
        card: '22px',
        tile: '28px',
      },
    },
  },
  plugins: [],
};
