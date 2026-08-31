# Pantry personalisation — decisions, build state, and the road ahead

Started 31 August 2026. This is the reference for turning pantry matching from a
coverage filter into the premium tier's real personalisation: a menu built from
both what's on special at your supermarket **and** what's already in your
cupboard, ranked by what you'd actually spend.

Read this before changing anything in `services/pantryMatcher.js`,
`services/priceHistoryService.js`, or the ranking. Several of the decisions
below look like they could be simplified. They can't — the reasons are recorded
here precisely because they aren't obvious from the code.

---

## 1. What was wrong

Two defects, both confirmed by reading the code rather than inferred.

**Pantry entry is unrestricted free text.** A `TextInput` and eight quick-add
chips. No autocomplete, no vocabulary, no validation, no normalisation at entry.
"Chook", "2kg chicken maryland" and "asdf" are all accepted equally, and nothing
ever tells the user which of their items the system failed to understand.

**Deals never influenced which recipes you got.** `matchPantry()` ranked the
whole library by coverage (matched ÷ required), cut to the top 20, and *only
then* loaded deals to decorate the missing ingredients. The user's chosen
supermarket could not affect the result at all — the lookup even used
`getDealsByState`, ignoring the store. So the feature optimised for "fraction of
ingredients you happen to own", which structurally favours short simple recipes
and is indifferent to money.

---

## 2. The risk that shapes every decision here

**A ranking does not merely tolerate bad cost estimates — it seeks them.**

If recipes are ordered by `cost − pantryCredit`, the top of the list is, by
construction, enriched for whichever recipes had their credit over-estimated.
You aren't averaging noisy estimates, you're taking the argmin over ~2,000 of
them, which selects for error in the favourable direction. The more recipes you
score, the more reliably the winners are the mistakes.

There's a second, systematic problem underneath it: **owning an ingredient is
not owning the recipe's portion of it.** You have a 200g block of parmesan; the
recipe wants 20g. Credit the pack price and you're 10× out — and it always errs
upward, hardest on expensive things.

Everything below follows from those two facts.

### The rules that fall out

1. **Never rank on a subtracted estimate.** Rank on what must be *bought* —
   priced from this week's real catalogue — not on the imputed value of what's
   owned. To wrongly promote a recipe you'd then have to *under*-price something
   you have real data for, which is a far harder mistake to make.
2. **The pantry enters as a count, never as a dollar figure.** "You have 6 of 9"
   is defensible. "$14 of ingredients you already own" is not, yet.
3. **Anything unpriced is assumed expensive** (`UNPRICED_ITEM_COST`, $4.00).
   Otherwise "we had no data" is indistinguishable from "it's free", and missing
   data wins every time.
4. **Never display a fabricated zero.** `$0.00 to finish` on a basket we
   couldn't price is the exact lie the ranking exists to avoid, and it's the one
   a reader is least likely to question. Exact figure when everything is priced,
   "from $X" when some is, no figure at all when none is.
5. **Rank on the total basket, not per serve.** Servings counts in the library
   run from 1 to 24 and aren't reliable; dividing by them hands the top of the
   list to whatever claims to feed the most people. Per serve is the honest unit
   to *read*, so it's shown — but only when the cost is complete.
6. **Separate what you rank on from what you display.** Rank on measurements.
   Show estimates with a qualifier, or not at all.

---

## 3. Homebrand vs branded

For *ranking*, consistency matters far more than level. A ranking survives being
uniformly 20% low; it does not survive recipe A priced at Essentials chicken
against recipe B at organic free-range. Same ingredient, 3× spread, meaningless
comparison.

**The policy: one pricing persona — "own-brand standard" — applied everywhere.**

- Per base ingredient, take the **25th percentile** of observed $/unit. p25 not
  the minimum (robust to bad parses and clearance oddities), not the median
  (which over-weights the branded goods that dominate catalogues).
- **Tier words never pool.** "Chicken thigh" and "organic free-range chicken
  thigh" are different products for pricing. `lib/unitPrice.js` holds the
  marker list; it mirrors how `lib/normalize.js` deliberately keeps *form* words
  (marinated, crumbed, smoked) out of a shared verdict.
- **Never blend tiers inside one recipe.** If an ingredient can only be priced
  from a branded observation, mark the whole recipe low-confidence rather than
  quietly mixing.
- **State the persona in the UI**: "$2.10 a serve at own-brand prices." One
  qualifier turns a contestable number into an honest one, and someone who buys
  premium still gets a correct comparison *between* recipes.
- **Later, make it a feature**: budget / standard / premium as a user setting,
  driven by the observed spread. It falls out of the data for free.

`priceTier(name, brand)` in `lib/unitPrice.js` classifies every observation as
`own` / `branded` / `premium` at record time, so the tier is available before
any rate is derived.

---

## 4. On scraping prices directly

We don't scrape Woolworths, Coles or IGA. All three services are thin wrappers
around **SaleFinder**, a third-party catalogue aggregator. We scrape catalogues,
not stores.

**What that gets us, free and without new infrastructure:** every weekly
catalogue item with `price`, `wasPrice`, and an advertised **unit price in $/kg
or ¢/100g**. Unit price is the right primitive — already normalised across pack
sizes and brands, which is the hard half of the problem.

**Limits, so nobody later mistakes this for a price index:**

- **Survivorship bias.** Catalogues only carry specials. Anything never
  discounted is permanently invisible. `wasPrice` partly rescues this.
- **Coverage.** ~470 items/week, heavily repeated. Expect 800–1,200 distinct
  products over 8 weeks, skewed to centre-aisle branded goods. Fresh produce and
  butcher meat — the things that anchor recipes — are least covered.
- **Freshness.** A 6-week median is wrong for tomatoes in a glut. Weight by
  recency for produce; not needed for tinned goods.
- **Loose vs packaged.** Bananas per kg, lettuce per each. Needs a unit basis
  per base ingredient or you compare $/kg against $/head.
- **State variation.** Real. Keep the series per state; never pool.

**Direct retailer scraping is deliberately not the plan.** Woolworths and Coles
both have JSON APIs behind their sites and would give full coverage including
never-discounted lines. It's against both retailers' terms of use, Coles sits
behind commercial bot protection, accurate pricing needs store-level location
selection, and it means pulling tens of thousands of SKUs on a schedule. Given
the care already taken over the publisher-content boundary
(`EXCLUDED_RECIPE_SOURCES`, in-app viewer rules), the same instinct applies: do
not build the product on a source that can be cut off or become a legal
conversation. **We don't need it** — we need rates for a few hundred base
ingredients, not a 40,000-SKU catalogue. If coverage later proves genuinely
insufficient, buy a commercial grocery price API; don't write a scraper.

---

## 5. What is built (done, 31 Aug 2026)

### 5.1 Price observations — the weekly recorder

Every Wednesday the pipeline read ~470 real prices, including unit prices, and
**threw all of them away**. Price data cannot be backfilled; a week not recorded
is gone. This is now fixed and is the foundation for everything in §6.

| File | What it does |
|---|---|
| `backend/lib/unitPrice.js` | Parses "$21 per kg" / "68¢ per 100g" into a normalised $/kg, $/L or $/each rate. Returns `null` rather than guessing. Also classifies price tier. |
| `backend/services/priceHistoryService.js` | Builds and records observation rows. Never throws — bookkeeping must not break the deal refresh. |
| `backend/database/pg.js`, `sqlite.js` | `savePriceObservations`, `getPriceObservationStats`. |
| `backend/services/dealService.js` | Hook inside `refreshStateDeals()`, which is Step 4 of the weekly cron. |

The table creates itself on deploy via the existing `_autoMigrate` block —
**there is no SQL for you to run.**

`price` and `wasPrice` are stored separately on purpose. The special answers
"what does this cost this week"; the was-price answers "what does this normally
cost". Pooling them makes every reference rate drift downward for ever.

`UNIQUE (observed_week, store, state, normalized)` makes recording idempotent —
the pipeline can be re-run or retried without doubling the series.

**To check it's working**, after the first Wednesday run, in Supabase → SQL
Editor:

```sql
SELECT
  observed_week,
  COUNT(*)                        AS prices_recorded,
  COUNT(unit_value)               AS with_unit_price,
  COUNT(DISTINCT normalized)      AS distinct_products,
  COUNT(*) FILTER (WHERE tier = 'own')     AS own_brand,
  COUNT(*) FILTER (WHERE tier = 'premium') AS premium
FROM price_observations
GROUP BY observed_week
ORDER BY observed_week DESC;
```

One row per week. `prices_recorded` should be in the low thousands (≈470 deals ×
7 states, minus overlap). If `with_unit_price` is near zero, the catalogue
scraper has stopped returning unit prices and §6.3 is blocked — investigate
`services/catalogueList.js`.

### 5.2 Ranking (v1)

`services/pantryMatcher.js` now ranks by **cost to complete** instead of
coverage, and is **store-aware**.

- Coverage is now only a shortlist filter (`PRICING_POOL`, 80 recipes) deciding
  who gets *priced*. Price decides who gets *shown*.
- Missing ingredients are priced against the user's state **and their chosen
  store**, falling back to the state if that store has no catalogue this week.
- Every unpriced missing item is charged `UNPRICED_ITEM_COST`.
- Sort: cheapest basket → fewest things to buy → highest coverage. With no price
  data at all this degrades gracefully into "fewest things to buy", which is the
  right answer in the absence of prices.

New response fields: `missingCount`, `unpricedCount`, `totalCostToComplete`
(nullable — a floor unless `costIsComplete`), `costToCompletePerServe`
(nullable), `costIsComplete`, `costConfidence`.

Mobile (`PantryResultsScreen.tsx`) leads with the price line rather than a
coverage badge, and says "from $X" / shows no figure, per rule 4 above.

---

## 6. What's next

Ordered. Each step has an acceptance test, because the failures here are
invisible — an unreasonable menu still looks like a menu.

### 6.1 Ingredient autocomplete — *do this first, it needs no AI*

The single biggest lever on match quality, and it's pure code.

Build a vocabulary from the 8,607 distinct ingredient names already in the
library, collapsed to a curated head of ~300 terms. Typing "chick" offers
"chicken breast / chicken thighs / whole chicken".

Three wins at once: match quality improves, the user learns what the system
understands, and the pantry vocabulary collapses to a small set — which is what
drives the AI cost in §6.4 to zero.

*Acceptance:* ≥90% of entered pantry items resolve to a known vocabulary term;
unresolved items are visibly flagged to the user rather than silently ignored.

### 6.2 "Your menu" — pantry as a re-ranker over the weekly menu

Distinct from "what can I cook tonight" (§5.2, which searches the whole
library). This re-ranks the **already-verified weekly store menu** — 150
recipes that have passed edge verification and hold a real hero deal.

Lowest-risk way to deliver the personalisation, because it introduces no new
recipes: the worst case is a mediocre ordering of an already-good list.

- Endpoint: `GET /api/pantry/menu` (premium), sharing the ranking from §5.2.
- Mobile: a "Your menu" screen off the premium hub.
- **The driver gate stays.** A pantry item may anchor a recipe *only if it's
  driver-class* (protein/centrepiece). A chicken thigh in the freezer is a
  legitimate hero; olive oil is not. Without this we reproduce the
  "kebabs because of olive oil" failure in a worse form — "we picked this
  because you own salt".
- Keep the variety draft, or a pantry heavy in one protein returns twenty
  versions of the same dinner.

*Acceptance:* every recipe in the output still holds a verified driver deal;
protein-family spread within 20% of the unpersonalised menu.

### 6.3 Reference rates from measured prices

Once **6–8 weeks** of `price_observations` exist:

1. Pool by `base_ingredient` (1,350 distinct values in the product DB) and unit
   basis, per state.
2. Rate = p25 of `unit_value` among `tier = 'own'` observations, excluding
   premium markers.
3. Recency-weight produce; don't bother for shelf-stable goods.
4. Store as a derived table, rebuilt weekly.

*Acceptance:* ≥60% of the ingredients appearing in the weekly menu resolve to a
measured rate; spot-check 20 rates against real shelf prices and stay within
±25%.

### 6.4 Per-ingredient costs, and only then dollar-denominated credit

`recipeCostService` gives a recipe **total** only. To credit what the user owns
you need the per-ingredient split.

**Derive it as a cascade, best evidence first:**

1. **This week's catalogue** — exact, for anything matched to a current deal.
2. **Measured reference rate** (§6.3) × quantity used.
3. **Claude, once, per base ingredient** — a $/kg or $/each rate for the ~1,350
   base ingredients, not a cost per recipe line. Durable in `recipe_meta`'s
   sibling table, same pattern as the existing totals. ~1,350 estimates cover
   all 27,635 ingredient lines, consistently.

**Quantity → cost uses code that already exists.** `savingsCalculator`'s
`parseQuantity` turns "1/2 cup rice" into 125ml, `parseDealSize` reads pack
sizes, and `calculateMealSavings` already computes *what fraction of the pack a
meal uses* (with an 80%-hero / 15%-condiment fallback and an `isEstimate` flag).
That is exactly the arithmetic that prevents the parmesan blow-up, and it's
already in production for deals. **Credit = rate × quantity used, never rate ×
pack.**

**Two hard constraints before any of this reaches a ranking:**

- **Reconcile to the total.** Scale the per-ingredient vector so it sums to
  `recipe_meta.total_estimated_cost`. Two independent estimates cross-checking.
  Disagreement over ~40% → mark low-confidence and exclude from dollar ranking.
- **Never double-count.** If an ingredient is both on special *and* in the
  pantry, it earns the pantry credit **or** the deal saving, never both. And the
  credit is the price you'd actually have paid — the sale price if it's on sale.
  A pantry item is genuinely worth less in a week when the thing is cheap.

**Plus:** never credit staples. `recipeCostService`'s prompt already assumes
oil, salt, pepper, spices, flour and sugar are free, so `totalEstimatedCost`
excludes them. Crediting them subtracts cost that was never there and produces
negative out-of-pocket figures.

Cap credit per ingredient by category, and cap total credit at ~70% of the
recipe total. You cannot have a $2 dinner because you own everything.

*Acceptance:* the golden set in §6.5 shows no degradation when dollar credit is
switched on. If it does, ship §6.2's ordering and leave credit off.

### 6.5 The golden set — build this alongside §6.2, not after

50 hand-checked `(pantry, recipe)` pairs with an agreed verdict on whether the
top-ranked results are genuinely cheap and genuinely cookable. Same discipline
as `scripts/eval/testHeroSelection.js` and `evalMatchModels.js`.

Without it, every change in §6.3 and §6.4 is unfalsifiable.

### 6.6 Later

- Budget / standard / premium pricing persona as a user setting (§3).
- Push notifications for price alerts (deliberately not built yet; the copy
  currently promises only in-app status).
- "Use it up" — flag pantry items lingering across weeks against current
  specials.

---

## 7. Costs

Measured, not guessed. The edge-judge prompt at its batch size of 30 pairs is
4,298 characters ≈ 900–1,200 input tokens, ~750 output. Judge model is Sonnet
4.6 at $3/$15 per million tokens; Haiku 4.5 is $1/$5. The Batch API halves
either and is fine for background regeneration, not for an interactive first
run.

Per 30-pair judge call: **~$0.014** (Sonnet 4.6), **~$0.005** (Haiku 4.5).

| Item | When | Cost |
|---|---|---|
| Pre-warm edge store: top ~300 pantry terms × ~30 ingredient matches | one-off | $4.20 / $2.10 batched / $0.70 Haiku+batch |
| Per-base-ingredient rate estimates (§6.4 tier 3) | one-off | ~$4.10 / ~$2.05 batched |
| New user, novel 20-item pantry, cold store | worst case, first use | ~$0.28 (Sonnet) / ~$0.09 (Haiku) |
| New user, after pre-warm | first use | ~$0.00–0.02 |
| Existing user, weekly regeneration | weekly | ~$0.00 |
| CPU per regeneration | ~2×/week per user | ~100ms |

**One-off setup ≈ $6–9. Marginal cost per subscriber per month ≈ zero.**

It collapses to zero for the same reason weekly matching already costs ~nothing:
pantry vocabulary is small and enormously repeated, and every verdict is judged
once and kept for ever. §6.1's autocomplete makes this better still by stopping
users inventing novel strings.

**The real constraint is CPU, not tokens.** Never re-score the library against
deals per user — that's ~13M comparisons, seconds each time, on a free-tier
instance. Reuse the cached per-store scored pool and overlay only the pantry
(~550k comparisons, ~100ms).

---

## 8. Things that will look like bugs and aren't

- **`totalCostToComplete` is `null`.** Deliberate. Nothing in the basket could
  be priced against this week's catalogue. Show the count, not a number.
- **`costToCompletePerServe` is `null` while `totalCostToComplete` is set.**
  Also deliberate — the total is a floor, so a per-serve figure would imply a
  precision we don't have.
- **Ranking ignores `totalSavings`.** Savings is a display field. Ranking on it
  reintroduces the subtracted-estimate problem in §2.
- **A recipe with 100% coverage isn't always first.** Correct — it's ranked on
  cost, and a recipe you can finish for $2 may beat one you can finish for free
  only if the free one has no driver. (Today it doesn't; §6.2 adds that.)
- **Pricing coverage looks poor in local dev.** The local deal cache is stale
  and has no per-state artifacts. Judge this in production only.
