# FAMITENLY marketing site

Public website for FAMITENLY, the School Operations Platform. Separate from the
product app in the repository root: it has its own `package.json` and builds to
a static site in `out/`.

## Run it locally

```bash
cd marketing
npm install
npm run dev        # http://localhost:3100
npm test           # calculator math (180 h / $5,040; 50% → 90 h / $2,520)
npm run build      # static export in marketing/out
```

## Where to change things

Everything editable lives in `src/config/site.ts`:

| What | Key |
|---|---|
| Brand name, descriptor, domain, sales email | `brand` |
| Demo form destination and booking link | `demo` (env vars below) |
| Prices and plan contents | `plans` |
| Live / In pilot / Planned labels | `features` |
| Calculator defaults and limits | `calculatorDefaults`, `calculatorLimits` |
| School-life photograph | `schoolPhoto` |
| Testimonials and school logos | `proof` (render only when filled) |

Colors and fonts are tokens at the top of `src/app/site.css`. The look is a light editorial system: white canvas, black ink and black/white pill buttons, with one large pastel color block per story section (cream, navy, mint, lilac; lime for emphasis), separated by white space. No shadows. Inside the navy block, `.block-navy` flips the tokens; `.on-light` resets them for light cards placed there. Open-source fonts: Inter Variable (display and body) and JetBrains Mono (uppercase eyebrows and small labels only).

## Before publishing

1. **Domain and email.** `brand.domain` and `brand.salesEmail` are placeholders on
   `famitenly.example`. Replace them with the real domain and a monitored inbox.
2. **Demo form destination.** None is connected. Without one, the form opens a
   pre-filled email to `brand.salesEmail` and shows no confirmation. To collect
   requests directly, set at build time:
   - `NEXT_PUBLIC_DEMO_FORM_ENDPOINT`: a URL that accepts a JSON POST
     (`name`, `email`, `school`, `sis`, `source`), for example a Formspree or
     HubSpot form endpoint. The success message appears only after a 2xx answer.
   - `NEXT_PUBLIC_DEMO_BOOKING_URL` (optional): a scheduling page shown after a
     successful request.
3. **Feature availability.** `features` reflects the product repo as of
   November 2026: portal, admin, calendar imports, documents and roles are live;
   notices, inbox, AI, forms, reminders, analytics, family assistant and SIS are
   planned. Update each label in the PR that ships the feature.
4. **Photograph.** No licensed school-life photo is included. Add one to
   `public/photos/` (with written consent for any identifiable children and a
   license that allows commercial use) and fill in `schoolPhoto`.
5. **Proof.** Add testimonials, logos or measured results only with written
   approval from the school.
6. **Legal details.** Fill in `legal` in `src/config/site.ts`: registered
   company name, postal address (shown in the footer and legal pages), the
   state whose law governs the terms and, if different, a privacy inbox. The
   drafts at `/privacy` and `/terms` should be reviewed by a lawyer before
   launch; they promise deletion of demo requests within 24 months and answers
   to privacy requests within 30 days.
7. **Analytics.** Set `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` (Cloudflare Web
   Analytics, free) or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (Plausible, paid). Both are
   cookieless, so the site needs no cookie banner. A demo request lands on
   `/thank-you`: count that page as the conversion.

## What the site includes

- Pages: `/`, `/privacy`, `/terms`, `/thank-you` (not indexed) and a custom 404.
- Each page has its own title, description, canonical link and social preview
  (`src/lib/meta.ts`). `robots.txt` and `sitemap.xml` are generated at build.
- Icons: `favicon.ico`, `icon.svg`, `apple-touch-icon.png`, 192/512 PNGs and
  `manifest.webmanifest`. Regenerate the PNGs if `icon.svg` changes.
- `vercel.json` sets `ignoreCommand` so Vercel builds only when something under
  `marketing/` changed (the command runs inside the Root Directory, so the
  path is `.`). It overrides the Ignored Build Step in the dashboard.
- Security headers (CSP, HSTS, no framing) in `vercel.json`. If you add a
  third-party script, add its host to `script-src` there.

## Deploy on Vercel

Create a second Vercel project from this repository with **Root Directory**
`marketing`. Framework preset: Next.js. No database or secrets are needed.
