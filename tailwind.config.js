/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
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
