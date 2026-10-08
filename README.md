# TequiLeah

A daytime studio in Hialeah, Miami for South Florida's builders, with a direct line to investors. An Elevate Innovation Technologies venture.

Design spec: `docs/superpowers/specs/2026-10-08-tequileah-site-design.md`

## Run

```
npm install
npm run dev        # http://localhost:5270
npm run build      # static site in dist/ (home, /apply/, /investors/)
```

## How it works

- **The Gravity stage** (`src/stage/stage.js`): one Three.js scene behind the page. A single timeline value `T` (0 to 5) drives everything: scattered lights (hero), the gather to Hialeah, the daylight room plan, the investor pipeline, and the connected close. `src/home.js` derives `T` from scroll. The stage loads after first paint and never blocks the copy.
- **Real map data** (`src/data/geo.json`) is built from US Census files by `scripts/geo/build-geo.mjs` (cb_2023 500k counties and places, TIGER 2023 roads and area water). Builder and investor lights are seeded positions weighted toward real towns and investment hubs. They are illustrative, not real people.
- **Fallbacks**: no WebGL shows an SVG poster from the same data. Reduced motion shows each chapter's end state with cross-fades, no scrubbing.
- **Application flows** (`/apply/`, `/investors/`): one question per screen, keyboard first, your light appears on the map and flies to the studio on submit. Content lives in `src/forms.js`.

## QA

```
node scripts/qa/shots.mjs http://localhost:5270 1440x900     # walks every chapter, saves qa-shots/
node scripts/qa/shots.mjs http://localhost:5270 390x844
REDUCED=1 node scripts/qa/shots.mjs http://localhost:5270 1440x900 rm
node scripts/qa/flow.mjs http://localhost:5270 builder        # or investor
node scripts/qa/a11y.mjs                                      # axe, all pages, desktop + mobile
```

## Before launch (needs Joe)

1. **Form endpoint**: set `FORM_ENDPOINT` in `src/config.js`. Until then the forms run in demo mode and send nothing.
2. **FAQ answers** in `index.html`: confirm cost, hours, and how investor intros work. Current answers are neutral placeholders.
3. **Address**: the map pins Hialeah city center. Swap in the real studio coordinates if you want the pin exact.
4. **Domain, social links, OG image**: none set yet.
5. **Privacy line** on the forms ("We use your answers only to get back to you.") must match your real policy.
6. No investor names, member names, or numbers appear anywhere. Add them only once confirmed.
