/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Brand name and page titles only; data stays in the system face.
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Single accent: deep blue. Chart marks use brand.500 (#2a78d6),
        // which passes the data-viz palette checks against a white surface.
        brand: {
          50: '#eff5fd',
          100: '#cde2fb',
          200: '#9ec5f4',
          300: '#6da7ec',
          400: '#3987e5',
          500: '#2a78d6',
          600: '#256abf',
          700: '#1c5cab',
          800: '#184f95',
          900: '#0d366b',
        },
        // Frame: deep navy sidebar, maple-gold brand mark, sky-tinted canvas.
        ink: { DEFAULT: '#0E2747', 800: '#16365E', 700: '#21477A', 300: '#9FB6D6', 200: '#C9D7EA' },
        sun: { 300: '#FAC96B', 400: '#F7B43A', 500: '#F5A524' },
        canvas: '#EEF4FB',
        line: '#D6E3F3',
        // Semantic colours. Fixed status palette — never reused for series identity.
        good: '#0ca30c',
        warning: '#fab219',
        critical: '#d03b3b',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
