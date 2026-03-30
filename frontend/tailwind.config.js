/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          void: '#000000',
          base: '#05050a',
          surface: '#0a0a12',
          elevated: '#101018',
          primary: '#000000',
          secondary: '#05050a',
          card: 'rgba(10, 10, 18, 0.85)',
        },
        brand: {
          blue: '#5E6AD2',
          cyan: '#06b6d4',
          indigo: '#5E6AD2',
          purple: '#8b5cf6',
        },
        status: {
          green: '#10b981',
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#5E6AD2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 5s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'neon-border': 'neon-border 3s ease-in-out infinite',
        'spin-slow': 'spin 12s linear infinite',
        'counter': 'counter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(94, 106, 210, 0.3)' },
          '100%': { boxShadow: '0 0 50px rgba(94, 106, 210, 0.8), 0 0 100px rgba(94, 106, 210, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'neon-border': {
          '0%, 100%': { borderColor: 'rgba(94, 106, 210, 0.25)', boxShadow: '0 0 20px rgba(94, 106, 210, 0.1)' },
          '50%': { borderColor: 'rgba(94, 106, 210, 0.55)', boxShadow: '0 0 40px rgba(94, 106, 210, 0.25)' },
        },
        counter: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
