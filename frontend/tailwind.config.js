/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Fraunces', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Deals to Dish — Direction 01 palette (see STYLE_GUIDE.md)
        bone:      '#F4EEE2',
        espresso:  '#2A241F',
        oat:       '#E7DECB',
        clay:      '#BE6A43',
        gum:       '#36453B',
        // Legacy SmartPlate names mapped to Direction-01 equivalents so
        // existing utility classes re-skin without per-file edits.
        leaf:      '#36453B',
        sprout:    '#2A352D',
        mist:      '#DCE4D6',
        honey:     '#BE6A43',
        peach:     '#E7DECB',
        blush:     '#E7DECB',
        parchment: '#F4EEE2',
        stone:     '#E0D8C8',
        bark:      '#2A241F',
        berry:     '#BE6A43',
        sky:       '#DCE4D6',
        cream:     '#FCFAF4',
        'text-muted': '#6B5F52',
        'text-green': '#36453B',
        // Store brand colours (keep as-is)
        woolworths: {
          DEFAULT: '#007833',
          light: '#E3E7D6',
        },
        coles: {
          DEFAULT: '#e31837',
          light: '#F2DFD6',
        },
        iga: {
          DEFAULT: '#003da5',
          light: '#DFE1E6',
        },
      },
    },
  },
  plugins: [],
}
