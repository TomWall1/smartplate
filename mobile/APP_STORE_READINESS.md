# App Store submission — blocker sign-off plan

Audited 2026-08-22 against the App Review Guidelines.

**Scope decided 2026-08-22: v1 ships a paid premium subscription.** That makes
B3 the largest piece of work in the release and pulls Apple's commercial
onboarding onto the critical path — see "Long-lead items" below.

**A blocker is signed off only when its test passes on a TestFlight build** —
not in Expo Go, not in the simulator. Purchases, restore, Sign in with Apple and
deletion of a real Supabase user all behave differently outside a store build.

---

## Implementation status — code complete 2026-08-22

The code side of every blocker is built. What remains is work only you can do:
Apple's paperwork, App Store Connect configuration, and testing on a real
build. Those are the unticked boxes below.

**Built**

| Area | Where |
|---|---|
| Entitlement with expiry | `backend/services/premiumService.js`, `scripts/migrations/addSubscriptionColumns.js` |
| RevenueCat webhook + reconcile | `backend/routes/subscriptions.js` |
| Account deletion | `backend/routes/users.js` (`DELETE /api/users/me`), `mobile/src/screens/AccountScreen.tsx` |
| Purchase / restore | `mobile/src/api/purchases.ts`, `mobile/src/screens/PaywallScreen.tsx` |
| Wired upgrade CTAs | `PremiumHubScreen`, `ProfileScreen`, `PremiumGate` |
| Privacy policy + terms | `frontend/src/pages/Legal.jsx` → `/privacy`, `/terms` |
| Native Apple button | `mobile/src/screens/auth/LoginScreen.tsx` |
| Export compliance | `mobile/app.json` |

**Before any of it runs**

- [ ] `node backend/scripts/migrations/addSubscriptionColumns.js` against production
- [ ] Render env: `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_SECRET_API_KEY`,
      `REVENUECAT_ENTITLEMENT_ID` (see `backend/.env.example`)
- [ ] RevenueCat dashboard: webhook → `POST https://deals-to-dish-api.onrender.com/api/subscriptions/webhook`,
      Authorization header set to the same secret
- [ ] `mobile/app.json` → `extra.revenueCatIosKey` (still `TODO_…`)
- [ ] Deploy the backend and redeploy the frontend (the `/privacy` URL must be
      live before it can go in App Store Connect)

---

## Long-lead items — start these today

Both are days of waiting you cannot compress, and everything else can proceed in
parallel with them.

- [ ] **Paid Applications Agreement (Schedule B)** — App Store Connect →
      Business. Until this is *Active*, with banking and tax forms accepted, you
      cannot create a subscription product at all, let alone sell one. Bank
      verification and the US tax form commonly take several days.
- [ ] **Privacy policy written and hosted** (B5). It is a mandatory ASC field,
      so it blocks upload rather than review.

---

## B3 — Premium purchase via StoreKit · Guidelines 3.1.1, 3.1.2

The headline item. `src/screens/ProfileScreen.tsx:113` advertises
**"$9.99/month"** with no purchase mechanism anywhere in the product. Digital
content must be sold through StoreKit — Stripe, a web checkout, or "contact us
to upgrade" are all disqualifying.

### Choose the implementation

**Recommended: RevenueCat** (`react-native-purchases`, Expo config plugin,
works in EAS builds). It absorbs receipt validation, renewals, cancellations,
refunds, grace periods and billing retry — the parts that are easy to get wrong
and invisible until they bite. It also covers Google Play from the same
entitlement model, which matters because `eas.json` already builds Android and
`app.json` has the Play package set. Free below their monthly-revenue threshold;
confirm current pricing before committing.

Alternative: raw StoreKit via `expo-iap` plus the App Store Server API. Cheaper
in fees, materially more work, and you own the whole renewal lifecycle.

- [x] Implementation chosen and recorded here: **RevenueCat**

### B3.1 — Commercial setup in App Store Connect

- [ ] Paid Applications Agreement active (see long-lead above)
- [ ] Auto-renewable subscription created in a subscription **group**
      (a group is required even for a single product, and makes later
      upgrade/downgrade tiers possible without migration)
- [ ] Product ID fixed and recorded — it can never be reused once created
- [ ] Price set in **A$**. The app currently says "$9.99" to an Australian
      audience; decide whether that is A$9.99 (ASC converts other storefronts
      automatically) and make the in-app copy say so unambiguously
- [ ] Localised display name and description filled in
- [ ] Review screenshot of the paywall uploaded to the subscription itself —
      a separate, commonly-missed field from the app's screenshots
- [ ] Subscription submitted **with** the app version; a first-version app and
      its IAP are reviewed together

### B3.2 — Entitlement becomes the source of truth

`is_premium` is a sticky boolean with no expiry. It is read in exactly three
places, so the gating itself needs no rewrite:

```
backend/middleware/requirePremium.js:8   → gates all /api/premium/*
backend/routes/recipes.js:96             → 150 vs 50 matched recipes
backend/routes/premium.js:47             → GET /api/premium/status
```

The problem is nothing ever clears it. Today it is set by hand
(`backend/routes/admin.js:57`); once real money is involved, a user who cancels
or is refunded stays premium forever.

- [x] Add `premium_expires_at` (timestamptz) and `premium_source`
      (`admin` | `app_store` | `play`) to `users`, as a migration in
      `backend/scripts/migrations/`
- [x] `requirePremium` treats a user as premium only while
      `is_premium AND (premium_expires_at IS NULL OR premium_expires_at > now())`.
      The NULL case preserves manual/comped grants
- [x] Webhook endpoint that receives entitlement changes (RevenueCat webhook, or
      App Store Server Notifications V2 if going raw) and writes the flag +
      expiry. Verify the signature; reject unsigned calls
- [x] Webhook is idempotent — Apple and RevenueCat both retry
- [x] Never trust the client's word that a purchase happened. The app may
      *optimistically* unlock on purchase, but the server sets the flag only
      from a validated server-side signal
- [x] Keep the admin toggle working for comped accounts and for the reviewer

**Sign-off**

- [ ] Sandbox purchase → `is_premium` true, expiry set, premium features unlock
- [ ] Sandbox renewal (accelerated in sandbox) → expiry extends
- [ ] Cancel in sandbox → access persists to period end, then stops
- [ ] Refund / revoke → access stops
- [ ] Replaying a webhook twice changes nothing
- [ ] Manually-comped account (expiry NULL) is unaffected by all of the above

### B3.3 — Client purchase flow

- [x] Paywall screen showing price, duration and exactly what is included
- [x] Purchase, success, cancel and failure states all handled
- [x] **Restore Purchases** control — mandatory, and separately checked by
      reviewers. A user reinstalling must regain access without paying again
- [ ] Purchase state survives app restart and reinstall
- [ ] Handles the user already owning the subscription on another device

### B3.4 — Required disclosures · Guideline 3.1.2

These must appear **in the app binary**, not only in App Store Connect. A
missing EULA link is a routine rejection.

- [x] Subscription title, length and price per period shown before purchase
- [x] What the subscription actually does, stated plainly
- [x] Link to Terms of Use — Apple's standard EULA is acceptable
- [x] Link to the privacy policy (B5)
- [ ] Same information in the ASC app description

### B3.5 — Do not mention buying elsewhere · Guideline 3.1.3(b)

The web app plans Stripe. If that ships, the iOS app must not link to it,
advertise it, or hint that a cheaper path exists outside the app. Honouring a
subscription bought on the web is fine; *steering* users there is not.

- [x] No external purchase links, prices, or "manage your plan on the web" copy
      in the iOS build

---

## B1 — Account deletion · Guideline 5.1.1(v)

The most common rejection for any app with sign-up. No delete UI
(`src/screens/AccountScreen.tsx:173` — the "Account" section holds only the
email row) and no backend endpoint. Deletion must be **initiable in-app**; an
email address or a web form is not sufficient.

**Fix**

`DELETE /api/users/me`, authed as the caller (never take a user id from the
body). Use the existing service-role client at
`backend/services/authService.js:17`.

The user-owned tables have **no `REFERENCES users(id)` foreign key** — they are
bare `user_id UUID` columns — so nothing cascades. Delete explicitly:

```
favorite_recipes · meal_plans · shopping_lists · price_alerts
user_pantries · match_feedback (nullable — anonymise, don't delete)
users · then adminSupabase.auth.admin.deleteUser(id)
```

Order matters: rows first, `auth.users` last, so a mid-way failure leaves an
account that can retry rather than orphaned rows with no owner.

**Subscription interaction — new under Option B.** Deleting an account does not
cancel an App Store subscription; only the user can, through Apple. If you delete
silently, they keep being charged for an account that no longer exists.

- [x] If the user has an active subscription, the confirm dialog says so and
      links to `https://apps.apple.com/account/subscriptions`
- [ ] Decide and document what a re-signup with the same Apple ID gets — the
      entitlement still exists at Apple, so Restore Purchases should recover it

**Sign-off**

- [ ] Create a throwaway account, add a favourite and a pantry, delete it
- [ ] `select * from users where id = '<id>'` → 0 rows; same for all six tables
- [ ] Supabase → Authentication → Users → the account is gone
- [ ] The old refresh token is rejected (401), app is back at the logged-out stack
- [ ] Signing up again with the same email succeeds and starts clean
- [ ] Path is reachable in ≤ 2 taps from the account screen, no external link
- [ ] Deleting twice (double-tap, flaky network) does not 500
- [ ] Deleting a **subscribed** account shows the cancellation notice and link

---

## B2 — Dead "Upgrade to Premium" buttons · Guideline 2.1

Reviewers tap every control. Three primary CTAs currently do nothing:

| Location | Behaviour |
|---|---|
| `src/screens/ProfileScreen.tsx:117` | `TouchableOpacity` with no `onPress` |
| `src/screens/ProfileScreen.tsx:201` | `TouchableOpacity` with no `onPress` |
| `src/screens/PremiumHubScreen.tsx:90` | handles signed-*out* only; signed-in tap is a no-op |

`src/components/PremiumGate.tsx` takes an `onUpgrade` prop that no caller passes,
and the component is never rendered.

**Fix** — every one of them opens the B3.3 paywall. `PremiumGate` becomes the
natural in-context entry point; wire it and use it, or delete it. Do not ship it
unused.

**Sign-off**

- [x] All three CTAs open the paywall
- [x] Signed-out tap routes to sign-in, then on to the paywall — not a dead end
- [ ] Every `TouchableOpacity` on Profile / PremiumHub has an `onPress` that
      does something observable
- [x] `PremiumGate` is either used or deleted

---

## B4 — Advertise only what ships · Guidelines 2.1, 2.3.1

`src/screens/PremiumHubScreen.tsx:14` lists five features; three have
`screen: null` and render a "Soon" badge — Meal Planner, Shopping List, Price
Alerts. `:104` says "Premium features coming soon — stay tuned!" out loud.

Selling makes this sharper than it was under the free plan. The current paywall
copy at `ProfileScreen.tsx:113` promises **"150 recipes/week … and meal
planning"** — meal planning does not exist, and the backend limit is 150 vs 50
*matched recipes*, not a weekly quota (`backend/routes/recipes.js:104`). Taking
money for an unbuilt feature is a 2.3.1 problem and a refund problem.

**Fix** — cut the three unbuilt entries. Ship **Favourites** and **Pantry
Matching**, which work, plus the 150-vs-50 recipe allowance stated accurately.
Re-add each feature in the release that implements it.

**Sign-off**

- [x] No `screen: null` entries remain in `PREMIUM_FEATURES`
- [ ] `grep -rniE 'coming soon|beta|placeholder|stay tuned' src` is clean of
      user-visible strings
- [x] Every card on the premium hub navigates somewhere real
- [x] Paywall copy names only shipped features, and describes the recipe
      allowance the way the backend actually behaves
- [ ] ASC description and screenshots match the paywall exactly

---

## B5 — Privacy policy · Guideline 5.1.1

No privacy policy exists anywhere in the product — no matches for "privacy" in
`mobile/src` or `frontend/src`. Mandatory ASC field.

**Fix** — cover what is actually collected: email and password via Supabase
Auth, `selected_store` / `state` / dietary preferences, pantry contents,
favourites, Google/Apple sign-in identifiers, and — new under Option B —
subscription and purchase state. Name Supabase, Render and RevenueCat as
processors. Include a deletion clause consistent with B1. Host at `/privacy` on
the marketing site.

**Sign-off**

- [ ] Policy is live at a stable public URL, no login required, loads on mobile
- [ ] URL entered in ASC → App Privacy
- [ ] Linked from Account, Profile, **and the paywall** (3.1.2 requires it there)
- [ ] Covers purchase/subscription data and the payment processor
- [ ] Content matches the ASC privacy labels exactly — they get compared

---

## Submission friction — fix before uploading

- [x] **Export compliance** — set `ios.config.usesNonExemptEncryption: false`
      in `app.json`, otherwise every upload stops to ask
- [ ] **App Privacy labels** — email address, user ID, product interaction,
      **purchase history**, plus whatever `@react-native-google-signin` collects
- [ ] **Sandbox testers** — ASC → Users and Access → Sandbox. Needed before any
      purchase testing; use a fresh Apple ID, never your own
- [ ] **Reviewer demo account** — credentials in the review notes, on an account
      you have comped to premium, so the reviewer can see gated features without
      transacting. Note in review notes that premium is also purchasable in-app
- [ ] **Content rights (5.2.1)** — short note covering supermarket deal data and
      recipe attribution. Current posture is defensible:
      `src/screens/recipes/RecipeDetailScreen.tsx:169` links out for the method
      rather than republishing it, and `:176` attributes the source

## Worth tightening — Guideline 4.8 / HIG

- [x] Replace the custom Apple button (`src/screens/auth/LoginScreen.tsx:174`,
      an Ionicons glyph in Inter) with
      `AppleAuthentication.AppleAuthenticationButton`
- [x] Order Apple at or above Google (`:155` vs `:173`)

---

## Order of work

1. **Today** — start the Paid Applications Agreement; start the privacy policy
2. B3.2 entitlement backend — migration, expiry logic, webhook. Independent of
   Apple's paperwork, so it proceeds while the agreement clears
3. B1 account deletion — the other backend piece, same shape of work
4. B3.1 ASC product setup, once the agreement is active
5. B3.3 + B3.4 paywall, restore and disclosures
6. B2 + B4 together — one pass over Profile and PremiumHub
7. Friction items, then the 4.8 tidy-up
8. TestFlight build; run every sign-off box against it
9. Submit app and subscription together

## Final gate

- [ ] All blockers signed off **on the same TestFlight build**
- [ ] `npx tsc --noEmit` clean
- [ ] Full purchase lifecycle exercised in sandbox: buy → renew → cancel →
      lapse → restore
- [ ] Full manual pass on a real device: guest browse → sign up → Apple
      sign-in → set store/state → hit a premium gate → purchase → favourite a
      recipe → pantry match → restore on a second install → delete account
