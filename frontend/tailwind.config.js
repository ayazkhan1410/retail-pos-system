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
        // Neutral greys from the approved Tijori design (cool, no colour cast).
        brand: {
          50: '#f7f7f8',
          100: '#f1f1f3',
          200: '#e6e6ea',
          300: '#d3d4d9',
          400: '#9a9ea6',
          500: '#6b7079',
          600: '#4b4f57',
          700: '#3f434a',
          800: '#23252a',
          900: '#0f1115',
          950: '#0b0c0e',
        },
        // Tijori indigo. Variables so dark mode can lift it to a readable shade.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
          glow: 'rgb(var(--accent-glow) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        // Near-black surfaces (kept for older markup; new markup uses brand-900).
        ink: {
          DEFAULT: '#0f1115',
          soft: '#1a1c20',
          muted: '#9a9ea6',
        },
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(16 17 20 / 0.05)',
        card: '0 1px 2px 0 rgb(16 17 20 / 0.04)',
        elevated: '0 16px 40px -12px rgb(16 17 20 / 0.22), 0 2px 6px -2px rgb(16 17 20 / 0.08)',
        glow: '0 1px 2px 0 rgb(16 17 20 / 0.10)',
        'pos-glow': '0 0 0 1px rgb(255 255 255 / 0.06)',
        receipt: '0 0 0 1px rgb(16 17 20 / 0.06), 0 1px 2px 0 rgb(16 17 20 / 0.05)',
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
