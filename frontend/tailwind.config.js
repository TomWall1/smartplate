/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Fredoka One"', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        // SmartPlate brand palette
        leaf:      '#7DB87A',
        sprout:    '#A8D5A2',
        mist:      '#D6EDD4',
        honey:     '#F4A94E',
        peach:     '#FBDFC3',
        blush:     '#F7EDE2',
        parchment: '#FDFAF5',
        stone:     '#E8E2D9',
        bark:      '#5C4A35',
        berry:     '#D4667A',
        sky:       '#89C4D8',
        cream:     '#FFF8EF',
        'text-muted': '#a09080',
        'text-green': '#3D7A3A',
        // Store brand colours (keep as-is)
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
      },
    },
  },
  plugins: [],
}
