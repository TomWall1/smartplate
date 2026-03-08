# SmartPlate — Design System & Style Guide

Use this document as the single source of truth for all UI decisions in this project. Every component, screen, and element you build should follow these rules exactly.

---

## Fonts

Import these two Google Fonts at the top level of the app (e.g. in `index.html` or the global CSS file):

```html
<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
```

| Role | Font | Weight |
|---|---|---|
| Headings, logo, section titles | Fredoka One | 400 (it's naturally bold) |
| Body text, labels, buttons, tags | Nunito | 600 for UI elements, 400 for paragraphs |

**Never use** Arial, Inter, Roboto, or system fonts anywhere in the UI.

---

## Colours

Use these CSS variable names throughout. Define them once in your global stylesheet:

```css
:root {
  /* Greens — Primary brand */
  --color-leaf:    #7DB87A;  /* Primary buttons, active nav, key actions */
  --color-sprout:  #A8D5A2;  /* Hover states, secondary highlights */
  --color-mist:    #D6EDD4;  /* Card backgrounds, selected states, headers */

  /* Warms — Mascot harmony */
  --color-honey:   #F4A94E;  /* Mascot accent, special highlights */
  --color-peach:   #FBDFC3;  /* Warm card backgrounds, deal accents */
  --color-blush:   #F7EDE2;  /* Soft section backgrounds */

  /* Neutrals — Base */
  --color-parchment: #FDFAF5; /* App background — use this, never pure white */
  --color-stone:     #E8E2D9; /* Borders, dividers, input outlines */
  --color-bark:      #5C4A35; /* Primary text — use this, never pure black */

  /* Accents */
  --color-berry:  #D4667A;  /* Sale badges, alerts, "On special" tags */
  --color-sky:    #89C4D8;  /* Info states, secondary badges */
  --color-cream:  #FFF8EF;  /* Premium tier highlights, tooltips */

  /* Text variants */
  --color-text-muted: #a09080;  /* Secondary text, metadata, hints */
  --color-text-green: #3D7A3A;  /* Text on green backgrounds */
}
```

**Key rules:**
- The app background is always `--color-parchment`, never `#ffffff`
- All body text is `--color-bark`, never `#000000`
- Secondary/helper text (e.g. "30 min · 4 serves") uses `--color-text-muted`
- Never use a stark white or black anywhere in the UI

---

## Border Radius

Everything should feel soft and rounded. Use these values consistently:

| Element | Radius |
|---|---|
| Cards, modals, large containers | `20px` |
| Buttons, input fields, inner cards | `12px` |
| Tags, badges, pills | `999px` (fully round) |
| Small thumbnails or icons | `10px` |

---

## Spacing

Use multiples of 4px for all padding and margins. Common values:

- Tight (inside tags/badges): `4px 10px`
- Standard (inside cards): `16px`
- Comfortable (page sections): `24px–32px`
- Page edge padding: `20px` on mobile, `32px` on desktop

---

## Buttons

**Primary button** (main actions — "View Recipe", "Save", "Get Started"):
```css
background: var(--color-leaf);
color: #ffffff;
font-family: 'Nunito', sans-serif;
font-weight: 700;
border-radius: 12px;
padding: 12px 24px;
border: none;
font-size: 15px;
```

**Secondary button** (less important actions):
```css
background: var(--color-mist);
color: var(--color-text-green);
font-family: 'Nunito', sans-serif;
font-weight: 700;
border-radius: 12px;
padding: 12px 24px;
border: none;
```

**Hover state for all buttons:** Slightly darken background by ~8% and add `transform: translateY(-1px)`.

---

## Tags & Badges

**Category / info tag** (e.g. "30 min", "Vegetarian"):
```css
background: var(--color-mist);
color: var(--color-text-green);
font-family: 'Nunito', sans-serif;
font-weight: 700;
font-size: 12px;
border-radius: 999px;
padding: 3px 12px;
```

**"On special" / deal badge:**
```css
background: var(--color-berry);
color: #ffffff;
font-family: 'Nunito', sans-serif;
font-weight: 700;
font-size: 12px;
border-radius: 999px;
padding: 3px 12px;
```

**Savings badge** (e.g. "Save $4.60"):
```css
background: var(--color-honey);
color: var(--color-bark);
font-family: 'Nunito', sans-serif;
font-weight: 700;
font-size: 12px;
border-radius: 999px;
padding: 3px 12px;
```

---

## Cards

All cards follow this pattern:

```css
background: #ffffff;
border: 1.5px solid var(--color-stone);
border-radius: 20px;
box-shadow: 0 2px 12px rgba(92, 74, 53, 0.08);
overflow: hidden;
```

Hover state: `box-shadow: 0 6px 24px rgba(92, 74, 53, 0.13); transform: translateY(-2px);`

Use `transition: all 0.2s ease` on all interactive cards.

---

## Input Fields

```css
background: #ffffff;
border: 1.5px solid var(--color-stone);
border-radius: 12px;
padding: 12px 16px;
font-family: 'Nunito', sans-serif;
font-size: 15px;
color: var(--color-bark);
outline: none;
```

Focus state: `border-color: var(--color-leaf); box-shadow: 0 0 0 3px rgba(125, 184, 122, 0.15);`

---

## Typography Scale

| Use | Font | Size | Weight | Colour |
|---|---|---|---|---|
| App name / logo | Fredoka One | 26px | 400 | `--color-bark` or `--color-text-green` |
| Page heading | Fredoka One | 22–24px | 400 | `--color-bark` |
| Section heading | Fredoka One | 18–20px | 400 | `--color-bark` |
| Card title | Fredoka One | 16–18px | 400 | `--color-bark` |
| Button / label | Nunito | 13–15px | 700 | varies |
| Body / description | Nunito | 13–14px | 400–600 | `--color-text-muted` |
| Small metadata | Nunito | 11–12px | 600 | `--color-text-muted` |

---

## Mascot Usage

The app mascot is a warm amber/orange character (squirrel family style). When placing the mascot in the UI:

- Always place on `--color-mist`, `--color-peach`, or `--color-honey` backgrounds — never on white or dark backgrounds
- The honey accent colour (`#F4A94E`) is reserved specifically to tie mascot moments into the UI (e.g. mascot avatar circles, celebration states, onboarding screens)
- Use the mascot for empty states, onboarding, loading screens, and success moments — not on every screen

---

## Tone of Voice (for any UI copy)

- Friendly and encouraging, like a knowledgeable mate — not corporate
- Short sentences. Active voice.
- Use "this week's specials" not "currently discounted products"
- Use "here's what you can make" not "recipes have been generated"
- Sign off moments with warmth: "You're all set 🎉" not "Process complete"

---

## What to Avoid

- ❌ Pure white (`#ffffff`) as a page background
- ❌ Pure black (`#000000`) for text
- ❌ Inter, Roboto, Arial, or any system font
- ❌ Sharp corners (border-radius below 10px on visible UI elements)
- ❌ Harsh drop shadows (always use warm-tinted shadows with low opacity: `rgba(92, 74, 53, 0.08)`)
- ❌ Cool grey tones — all neutrals in this design are warm
- ❌ Purple, blue, or other colours not in the palette above
