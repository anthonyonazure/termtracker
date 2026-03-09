/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1a1a1a',
          card: '#242424',
          hover: '#2a2a2a',
          border: '#333333',
        },
        accent: {
          orange: '#e8763a',
          green: '#4ade80',
          blue: '#38bdf8',
          cyan: '#22d3ee',
          red: '#ef4444',
          yellow: '#facc15',
        },
      },
    },
  },
  plugins: [],
}
