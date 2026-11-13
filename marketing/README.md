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

Colors and fonts are tokens at the top of `src/app/site.css`. The look follows a dark editorial system (near-black canvas, mint `#3cffd0` and ultraviolet `#5200ff` accents, 1px hairlines, no shadows) with open-source fonts: Anton (display, 60px+ only), Space Grotesk (UI and body), Space Mono (uppercase labels and buttons).

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
6. **Legal pages.** Privacy policy and terms are not part of this site yet;
   schools will ask for them (FERPA/COPPA questions).

## Deploy on Vercel

Create a second Vercel project from this repository with **Root Directory**
`marketing`. Framework preset: Next.js. No database or secrets are needed.
