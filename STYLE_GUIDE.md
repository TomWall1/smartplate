# Deals to Dish — Brand & Design System (Direction 01)

> Canonical brand and design reference. **Before building or changing any screen or component, read this file.** Lead with the brand rationale (§1–2), then apply the tokens and rules (§3–9). When a decision isn't covered here, choose the option that feels calm, premium-but-grounded, and treats the user as a capable adult — then record the new pattern in this file.

---

## 1. Brand essence

**Who we're for.** Busy Australian mothers, most of them working professionals. Time-poor, design-literate, carrying the household's mental load. They use good software every day and have a sharp radar for being talked down to.

**The one feeling.** Competence and control. Using the app should feel like having a sharp personal concierge who has quietly handled the thinking — not like clipping coupons, and not like being coached by a cartoon.

**The core reframe — smart, not cheap.** We are not a discount tool. Discount aesthetics (loud reds, "SALE", starbursts, comparison-site density) signal cheapness, and cheapness is the wrong emotion for this person. She isn't desperate; she's savvy. Saving money should feel *sophisticated and effortless*. Every design decision flows from "you're smart, here's how to win the week" — never "you're broke, here's how to scrape by."

**Trust is the moat.** Credibility, warmth, and honesty carry the brand — not a mascot, not a bright colour, not gamification. The design's job is to earn trust through restraint and clarity.

---

## 2. Voice & tone

**Principles**
- Plain-spoken, warm, quietly confident, occasionally dry.
- Treats her as the capable adult she is.
- Active voice. A control says exactly what happens: "View shopping list," not "Submit."
- The same word survives the whole flow: the button that says "Save plan" produces a confirmation that says "Plan saved."
- Sentence case everywhere. No filler. No exclamation spam.

**Do / don't (copy)**

| Don't | Do |
|---|---|
| "You're crushing it, mama! Huge savings unlocked!" | "Nice work. You saved $47 this week, built from what was on special." |
| "Oops! Something went wrong 😟" | "We couldn't build this week's plan just yet. Try again — it'll only take a moment." |
| "Configure your household parameters" | "Who are we cooking for?" |
| "SALE! Don't miss out!" | "On special at Coles this week" |

**Microcopy patterns**
- **Buttons:** name the outcome ("Start this week", "View shopping list").
- **Empty states:** an invitation to act, never a dead end.
- **Errors:** explain what happened and the next step, in the product's voice. No blame, no apologies, never a raw error code shown to the user.
- **The savings moment:** one plain sentence of context under one number. No hype.

Banned vocabulary: *mama, hun, bestie, crushing it, unlock(ed), SALE, don't miss out, oops*.

---

## 3. Colour

Warm, earthy, food-forward, editorial. Bone paper base (never stark white), eucalyptus green as the action colour, clay as the value highlight.

| Name | Light | Role |
|---|---|---|
| Bone | `#F4EEE2` | App background |
| Warm white | `#FCFAF4` | Raised card surface |
| Oat | `#E7DECB` | Wells, tags, subtle fills, skeletons |
| Espresso | `#2A241F` | Primary text |
| Warm taupe | `#6B5F52` | Secondary text |
| Gum green | `#36453B` | **Primary action** |
| Clay | `#BE6A43` | **Value & savings highlight only** |

### CSS tokens

```css
:root {
  /* surfaces */
  --color-bg: #F4EEE2;
  --color-surface: #FCFAF4;
  --color-surface-sunken: #E7DECB;

  /* text */
  --color-ink: #2A241F;
  --color-ink-secondary: #6B5F52;
  --color-ink-tertiary: #9A8F80;

  /* borders */
  --color-border: rgba(42, 36, 31, 0.12);
  --color-border-strong: rgba(42, 36, 31, 0.20);

  /* brand (action) */
  --color-brand: #36453B;
  --color-brand-hover: #2A352D;
  --color-brand-tint: #DCE4D6;   /* quiet green fills, tags */
  --color-brand-text: #36453B;   /* green text/icons */
  --color-on-brand: #F4EEE2;     /* text/icons on green fill */

  /* accent (value highlight ONLY) */
  --color-accent: #BE6A43;
  --color-accent-hover: #A4572F;
  --color-on-accent: #FCFAF4;
}

[data-theme="dark"] {
  --color-bg: #1B1916;
  --color-surface: #242019;
  --color-surface-sunken: #15130F;

  --color-ink: #F1EBDF;
  --color-ink-secondary: #B6AC9B;
  --color-ink-tertiary: #837A6B;

  --color-border: rgba(241, 235, 223, 0.14);
  --color-border-strong: rgba(241, 235, 223, 0.24);

  --color-brand: #4B5F51;        /* lifted green for fills */
  --color-brand-hover: #5A715F;
  --color-brand-tint: #2A3630;
  --color-brand-text: #8FA893;   /* lifted green for text/icons */
  --color-on-brand: #F1EBDF;

  --color-accent: #D4824F;       /* lifted clay */
  --color-accent-hover: #E0925F;
  --color-on-accent: #1B1916;
}
```

### Usage rules
- **Green is the action colour. Clay is the value colour.** This is the single most important rule. Primary buttons and CTAs are green. Clay is reserved for the savings figure, price-drop emphasis, and "you saved" highlights. **Never make a general button clay** — that's the line between premium and discount-loud.
- Backgrounds are bone, surfaces are warm white. Never pure `#FFF`. Text is espresso, never pure `#000`.
- "On special" is communicated by calm presence (a subtle tag), never by red or urgency.

---

## 4. Typography

Editorial serif for moments, clean humanist sans for everything functional. The serif-over-sans pairing is the premium-food signal; keeping the serif rare is what keeps it special.

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400..500&family=Inter:wght@400;500&display=swap');

:root {
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
}
```

### Type scale

| Token | Face | Size | Weight | Line-height | Use |
|---|---|---|---|---|---|
| `display-xl` | Fraunces | 48 | 500 | 1.0 | Weekly savings number, hero moment |
| `display` | Fraunces | 32 | 500 | 1.1 | Large editorial figures |
| `title` | Fraunces | 26 | 500 | 1.2 | Screen titles |
| `heading` | Fraunces | 21 | 500 | 1.25 | Section headers, recipe names |
| `subhead` | Inter | 17 | 500 | 1.35 | Card titles, UI headers |
| `body` | Inter | 16 | 400 | 1.6 | Default reading text |
| `body-sm` | Inter | 14 | 400 | 1.5 | Secondary text, list meta |
| `label` | Inter | 13 | 500 | 1.4 | Eyebrows, tags, field labels (+0.02em tracking) |
| `button` | Inter | 16 | 500 | 1.0 | Actions |
| `caption` | Inter | 12 | 400 | 1.4 | Timestamps, legal (never go below 12px) |

### Usage rules
- **Fraunces only for screen titles, hero/value numbers, and editorial moments** (incl. recipe names). Never on buttons, labels, or dense UI.
- **Inter for everything functional.** Keeps the interface crisp and avoids serif fatigue.
- Two weights only: 400 and 500. No heavy weights.

---

## 5. Spacing, radius, layout

**Spacing** — 4px base. Use multiples: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Default screen padding: 20px. Card padding: 20–24px. Gap between sections: 32px.

**Radius**
```css
:root {
  --radius-sm: 8px;   /* inputs, tags, chips */
  --radius-md: 12px;  /* cards, buttons */
  --radius-lg: 16px;  /* sheets, the savings hero card, modals */
}
```
- Full borders only with radius. A single-sided accent border (`border-left` etc.) gets `border-radius: 0`.

**Layout** — generous whitespace is a feature. One clear purpose per screen. Whitespace, not lines, does most of the separating.

---

## 6. Imagery & icons

**Photography** — real, achievable home meals in natural light, shot top-down or three-quarter on bone, timber, or linen surfaces. Warm white balance. One hero photo max per screen; thumbnails for recipe rows.
- No glossy ad-food, no red-pushed saturation, no stock business imagery, **no characters or mascots.**

**Icons** — a single line set, ~1.75px stroke, rounded caps/joins, 24px default. Outline only, never filled/cartoon. Icons are wayfinding, not decoration.

---

## 7. Motion

```css
:root {
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms;
  --dur: 180ms;
  --dur-slow: 260ms;
}
```
- **Delight budget is small and focused.** The one orchestrated moment is the savings figure counting up (gentle, ~600ms ease-out) with a soft fade/slide on the weekly card.
- Micro-feedback on tap (scale 0.98, 120ms). Nothing loops, bounces, or floats.
- Respect `prefers-reduced-motion`. No confetti, ever.

---

## 8. Components

### Home screen
- Opens **directly to "This week's plan."** No dashboard, no menu wall. The single purpose is visible immediately.
- Six dinners as a calm vertical list: food thumbnail + recipe name (`heading`) + one meta line (`body-sm`, e.g. "On special at Coles · serves 4"). Generous spacing, light separation.
- The week's saving shown once, quietly, near the top — informative, not shouting.
- **One** primary action (green). Secondary actions are outline. No competing CTAs, no cross-sell, no banners.

### The weekly savings moment (the signature)
- Bone/warm-white card, `--radius-lg`, generous padding.
- Eyebrow "This week" (`label`, green).
- Hero figure in `display-xl`, **clay** — the one place clay is the star.
- One plain line of context (`body`, espresso): "Across six dinners — built entirely from this week's Coles and Woolworths specials."
- Appears when the new week's specials populate / on first open of a new cycle. Count-up animation on the figure.
- A quiet share affordance (outline button) — this is the shareable, group-chat artefact. Offer it; don't force it.
- **One number, one sentence.** Never stack badges, streaks, or extra metrics here.

### Onboarding
- **Max three screens, real plan within ~30 seconds.** Each screen does one job.
- Ask only what changes recipe selection: household size, dietary needs/dislikes, preferred store(s). Tappable choices, not long forms.
- Show a genuine plan built from real specials **before** asking for commitment. If auth is needed, do it *after* she's seen value.

### Empty / loading / error
- **Loading:** skeleton screens in oat tones, shaped like the content that's coming. No naked spinners. Optimistic UI where safe.
- **Specials still loading:** calm message + skeleton ("Finding this week's best buys…"). Never a blank screen or a lone spinner.
- **Empty:** an invitation with the one action to fix it.
- **Error:** plain language, no blame, no raw codes, a clear retry. *Note:* the weekly-generation race condition must surface as a graceful retry state — the user should never see a 500.

### Buttons & actions
- **Primary** = green fill (`--color-brand`), `--color-on-brand` text, hover `--color-brand-hover`. The only default CTA colour.
- **Secondary** = outline (`--color-border-strong`), ink text, transparent fill.
- **Clay is a value highlight, not an action colour.** Never a clay general button.
- Tap targets ≥44px. Always a visible keyboard focus ring.

### Tags ("on special")
- Subtle pill (`--radius-sm`), `--color-surface-sunken` or `--color-brand-tint` fill, dark same-family text, `label` type.
- Never a red starburst, never "SALE", never animated urgency.

### Cards
- `--color-surface` bg, optional 0.5px `--color-border`, `--radius-md`, padding 20–24px. Warmth over contrast; no heavy shadows.

---

## 9. Anti-patterns — do not

- No discount red, "SALE", starbursts/sunbursts, or flashing urgency.
- No mascots, characters, or cartoon illustration.
- No gamification for its own sake — no XP, no streak-shaming, no confetti, no badges.
- No baby-talk or influencer voice ("mama", "hun", "bestie"); no exclamation spam.
- No comparison-site density. One primary thing per screen.
- No pure-white (`#FFF`) backgrounds or pure-black (`#000`) text.
- No rounded "bubbly" display fonts.
- No glossy stock food or over-saturated imagery.
- No clay-coloured general buttons (clay = value highlight only).

---

## 10. Dark mode

- Every token has a dark equivalent (§3). Keep it **warm** — warm charcoal, never blue-black.
- Green and clay lift for contrast: use `--color-brand-text` for green text/icons; clay shifts to `#D4824F`.
- Food photography carries through unchanged; give thumbnails a subtle warm border so they don't float on dark.
- Test every text-on-surface pair for contrast in both modes.
