/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        accent: {
          DEFAULT: '#01411C',
          light: '#0f5c2e',
          glow: '#22c55e',
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.03)',
        card: '0 0 0 1px rgb(0 0 0 / 0.03), 0 2px 4px rgb(0 0 0 / 0.04), 0 12px 24px rgb(0 0 0 / 0.04)',
        elevated: '0 0 0 1px rgb(0 0 0 / 0.04), 0 8px 16px rgb(0 0 0 / 0.06), 0 24px 48px rgb(0 0 0 / 0.08)',
        glow: '0 0 40px -8px rgb(1 65 28 / 0.35)',
        'pos-glow': '0 0 60px -12px rgb(255 255 255 / 0.08)',
      },
      backgroundImage: {
        'mesh-light': 'radial-gradient(at 40% 20%, rgb(1 65 28 / 0.06) 0px, transparent 50%), radial-gradient(at 80% 0%, rgb(0 0 0 / 0.03) 0px, transparent 50%), radial-gradient(at 0% 50%, rgb(1 65 28 / 0.04) 0px, transparent 50%)',
        'mesh-dark': 'radial-gradient(at 40% 20%, rgb(34 197 94 / 0.08) 0px, transparent 50%), radial-gradient(at 80% 0%, rgb(255 255 255 / 0.03) 0px, transparent 50%)',
        'pos-panel': 'linear-gradient(145deg, rgb(24 24 27) 0%, rgb(9 9 11) 100%)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
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
