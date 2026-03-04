/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        secondary: {
          50: '#f8fafc',
          500: '#64748b',
          600: '#475569',
        },
        woolworths: {
          DEFAULT: '#007833',
          light: '#e8f5e9',
        },
        coles: {
          DEFAULT: '#e31837',
          light: '#ffeaed',
        },
        iga: {
          DEFAULT: '#003da5',
          light: '#e8eeff',
        },
        cream: {
          DEFAULT: '#fef9f0',
          warm: '#fdf3e3',
        },
      },
    },
  },
  plugins: [],
}
