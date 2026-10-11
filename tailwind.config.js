/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Impact Connect: one face (Urbanist) for headings and data alike.
        display: ['"Urbanist Variable"', 'Urbanist', 'system-ui', 'sans-serif'],
        sans: ['"Urbanist Variable"', 'Urbanist', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        // Warm neutrals from the Impact Connect design. Overrides Tailwind's
        // cool slate so every existing page picks the new tone up unchanged.
        slate: {
          50: '#f7f6f3',
          100: '#f0efeb',
          200: '#e3e1db',
          300: '#d7d5cf',
          400: '#a9a8ac',
          500: '#77767a',
          600: '#55545a',
          700: '#3a3a3d',
          800: '#232325',
          900: '#1d1d1f',
        },
        // UI accent: near-black for actions and links, soft yellow for
        // highlights (light tints) — the design's black-and-yellow pairing.
        brand: {
          50: '#fdf7dc',
          100: '#faedb8',
          200: '#f5df8a',
          300: '#f0cf55',
          400: '#55545a',
          500: '#2c2c2f',
          600: '#1d1d1f',
          700: '#1d1d1f',
          800: '#1d1d1f',
          900: '#111112',
        },
        // Find People task colour — kept as-is so the extension panel still matches.
        lead: { 50: '#eff5fd', 500: '#2a78d6', 600: '#256abf', 700: '#1c5cab', 800: '#184f95' },
        ink: { DEFAULT: '#1d1d1f', 800: '#232325', 700: '#3a3a3d', 300: '#9c9ba0', 200: '#cfcdc8' },
        sun: { 50: '#fdf7dc', 100: '#fbeaa9', 300: '#f8e08a', 400: '#f5d24f', 500: '#f0c419' },
        canvas: '#efefee',
        line: '#e3e1db',
        // Semantic colours. Fixed status palette — never reused for series identity.
        good: '#0ca30c',
        warning: '#fab219',
        critical: '#d03b3b',
      },
      borderRadius: {
        card: '22px',
        tile: '28px',
      },
    },
  },
  plugins: [],
};
