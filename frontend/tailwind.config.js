/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // One family across the app. `display` stays as an alias so existing classes keep working.
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      colors: {
        // Neutral scale with a faint green cast, so greys sit with the brand green instead of against it.
        brand: {
          50: '#f5f7f6',
          100: '#eef2f0',
          200: '#dfe5e2',
          300: '#c6cfca',
          400: '#94a19a',
          500: '#67746d',
          600: '#4c5852',
          700: '#37423c',
          800: '#232c27',
          900: '#161d19',
          950: '#0c120e',
        },
        // Pakistan flag green. Defined as variables so dark mode can lift it to a readable shade.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
          glow: 'rgb(var(--accent-glow) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        // Sidebar and other deep brand surfaces.
        ink: {
          DEFAULT: '#062b18',
          soft: '#0b3a22',
          muted: '#8fb3a0',
        },
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(16 29 22 / 0.05)',
        card: '0 1px 2px 0 rgb(16 29 22 / 0.04)',
        elevated: '0 16px 40px -12px rgb(16 29 22 / 0.22), 0 2px 6px -2px rgb(16 29 22 / 0.08)',
        glow: '0 6px 16px -6px rgb(1 65 28 / 0.55)',
        'pos-glow': '0 0 0 1px rgb(255 255 255 / 0.06)',
        receipt: '0 1px 0 rgb(16 29 22 / 0.04), 0 10px 30px -14px rgb(16 29 22 / 0.25)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 0.16s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'row-in': 'row-in 0.6s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // A just-scanned line flashes once so the cashier sees what changed.
        'row-in': {
          '0%': { backgroundColor: 'rgb(var(--accent) / 0.14)' },
          '100%': { backgroundColor: 'transparent' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
