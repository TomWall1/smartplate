/**
 * Privacy policy and terms of use.
 *
 * These exist because the App Store requires them: the privacy policy URL is a
 * mandatory App Store Connect field, and Guideline 3.1.2 requires both to be
 * linked from inside the app on any screen that sells a subscription. The
 * mobile app links here (mobile/src/screens/PaywallScreen.tsx) so the two must
 * stay in step — in particular, the deletion clause below has to keep matching
 * what DELETE /api/users/me actually does.
 *
 * Not legal advice: this is a plain-language starting point covering what the
 * product genuinely collects. Have it reviewed before launch.
 */
import React from 'react';

const LAST_UPDATED = '22 August 2026';
const CONTACT_EMAIL = 'hello@dealtodish.com';

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 500,
          color: 'var(--color-ink)',
          marginBottom: '0.75rem',
        }}
      >
        {title}
      </h2>
      <div style={{ color: 'var(--color-ink-secondary)', lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

function Shell({ title, children }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 500,
          color: 'var(--color-ink)',
          marginBottom: '0.5rem',
        }}
      >
        {title}
      </h1>
      <p style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem', marginBottom: '2.5rem' }}>
        Last updated {LAST_UPDATED}
      </p>
      {children}
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy policy">
      <p style={{ color: 'var(--color-ink-secondary)', lineHeight: 1.7, marginBottom: '2rem' }}>
        Deals to Dish helps you find recipes built around what is on special at
        Australian supermarkets. This policy explains what we collect, why, and
        what you can do about it. It covers both the website and the mobile app.
      </p>

      <Section title="What we collect">
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li>
            <strong>Account details</strong> — your email address, and a password
            if you did not sign in with Google or Apple. Passwords are handled by
            our authentication provider and are never visible to us.
          </li>
          <li>
            <strong>Sign-in identifiers</strong> — if you use Google or Apple, we
            receive an identifier and your email address from them. Apple lets you
            hide your real address, and that works normally here.
          </li>
          <li>
            <strong>Your preferences</strong> — the supermarket and state you
            shop in, household size, and any dietary restrictions or excluded
            ingredients you set.
          </li>
          <li>
            <strong>Things you save</strong> — pantry contents, favourite
            recipes, and shopping lists.
          </li>
          <li>
            <strong>Subscription status</strong> — whether you have an active
            premium subscription, when it renews or expires, and which store it
            was bought through. We never see your card details.
          </li>
        </ul>
        <p style={{ marginTop: '0.75rem' }}>
          We do not collect your location, contacts, photos, or any device
          identifier for advertising. We do not track you across other apps or
          websites, and we do not sell personal information.
        </p>
      </Section>

      <Section title="Why we collect it">
        <p>
          To match recipes to the deals at your store, to keep your saved items
          between devices, to know whether premium features are available to you,
          and to answer you if you get in touch. That is the whole list.
        </p>
      </Section>

      <Section title="Who processes it">
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li><strong>Supabase</strong> — accounts, authentication and database.</li>
          <li><strong>Render</strong> — hosting for our backend.</li>
          <li><strong>Vercel</strong> — hosting for this website.</li>
          <li>
            <strong>RevenueCat</strong>, with <strong>Apple</strong> and{' '}
            <strong>Google</strong> — subscription purchases and their status.
            Payment is taken by the app store, not by us.
          </li>
        </ul>
        <p style={{ marginTop: '0.75rem' }}>
          These providers process data on our behalf so we can run the service.
          Some of them store data outside Australia.
        </p>
      </Section>

      <Section title="Recipes from other sites">
        <p>
          Recipe method and instructions stay on the publisher's own site. When
          you open a full recipe we send you there, and that site's own privacy
          policy applies to what happens next.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account at any time — in the app under{' '}
          <strong>Account → Delete account</strong>, or on the website from your
          profile page. This permanently removes your profile, pantry, favourites,
          shopping lists and price alerts. It cannot be undone.
        </p>
        <p style={{ marginTop: '0.75rem' }}>
          Two things deliberately survive deletion. Anonymous recipe-matching
          feedback is kept with all links to you removed, because it is aggregate
          quality data rather than anything about you. Subscription and payment
          records are kept because we are required to retain financial records.
        </p>
        <p style={{ marginTop: '0.75rem' }}>
          <strong>Deleting your account does not cancel your subscription.</strong>{' '}
          App Store subscriptions can only be cancelled through Apple, in your
          App Store account settings. Cancel there first, or billing continues.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask us for a copy of what we hold about you, ask us to correct
          it, or ask us to delete it. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          and we will respond within a reasonable time. If you are unhappy with
          how we have handled a privacy matter you can complain to the Office of
          the Australian Information Commissioner.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The service is not directed at children under 13 and we do not
          knowingly collect their information.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes materially we will update the date at the top
          and, where the change affects you, tell you in the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of use">
      <Section title="Using Deals to Dish">
        <p>
          Deals to Dish shows recipes matched to advertised supermarket specials.
          You may use it for your own personal, non-commercial cooking and
          shopping. Do not scrape it, resell it, or use it to build a competing
          dataset.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          You are responsible for what happens under your account. Tell us
          promptly if you think someone else has access to it. You can delete
          your account at any time from Account → Delete account.
        </p>
      </Section>

      <Section title="Premium subscriptions">
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li>
            Premium is an auto-renewing subscription. The price and billing
            period are shown in the app before you buy, in your local currency.
          </li>
          <li>
            Payment is charged to your Apple ID at confirmation of purchase.
          </li>
          <li>
            It renews automatically unless you turn off auto-renew at least 24
            hours before the current period ends. Your account is charged for
            renewal within the 24 hours before the period ends.
          </li>
          <li>
            Manage or cancel your subscription in your App Store account
            settings. Deleting your Deals to Dish account does not cancel it.
          </li>
          <li>
            Refunds are handled by Apple under their terms, not by us.
          </li>
        </ul>
      </Section>

      <Section title="Prices and deals are indicative">
        <p>
          Deal information comes from publicly advertised supermarket specials
          and can be wrong, out of date, or unavailable at your particular store.
          Always check the price in-store. We are not affiliated with, endorsed
          by, or sponsored by Woolworths, Coles, IGA or any other retailer, and
          their names and logos remain their own.
        </p>
      </Section>

      <Section title="Recipes and allergies">
        <p>
          Recipes are provided for general information. Ingredient matching is
          automated and can be imperfect. If you have an allergy or a medical
          dietary requirement, check the actual product labels — do not rely on
          this app for that.
        </p>
        <p style={{ marginTop: '0.75rem' }}>
          Recipe method and instructions belong to the publishers who wrote them
          and stay on their sites. We link to the source and credit it.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We do our best to keep the service running but do not guarantee it will
          be uninterrupted or error-free. We may change or discontinue features.
          If we discontinue a paid feature during a period you have paid for,
          contact us.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          Nothing here excludes rights you have under the Australian Consumer Law
          that cannot be excluded. Beyond those rights, the service is provided
          as is, and our liability is limited to the amount you paid us in the
          twelve months before the claim.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </Shell>
  );
}
