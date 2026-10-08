# TequiLeah website: design spec

Date: 2026-10-08 · Owner: Joe (Elevate Innovation Technologies) · Benchmark to surpass: hackerhouse.ai

## What TequiLeah is

A daytime studio in Hialeah, Miami where serious solo builders and creatives from across South Florida work side by side, team up on projects, and get a direct, in-person pipeline to EIT's Miami investor network. Its own brand ("An Elevate Innovation Technologies venture"), not the TequilaTown look.

## Experience thesis

The visitor should feel the loneliness of building solo turn into momentum as they scroll a real map of South Florida from scattered lights to one connected network, because TequiLeah's truth is that the builders and the money are already here, just not in the same room.

Core line: **Florida is full of people building alone.** Close: **Stop building alone.**

## Signature mechanism: Gravity

One persistent WebGL stage (Three.js) behind the page. One set of ~700 lights, one state machine, escalating:

| Chapter | Ground | Lights |
|---|---|---|
| 1 Hero | night | scattered across real South Florida land (Census 500k geometry), flickering out of sync; cursor is a lamp that reveals a neighborhood + local time tag |
| 2 The turn | night | lights travel curved paths to Hialeah, staggered by distance, with trails; camera pushes in |
| 3 The room | night to day | lights become seats in a room drawing, link to neighbors, flicker syncs; ground turns to daylight paper, lights become ink |
| 5 The pipeline | day to night | camera pulls back to the full map; investor lights (cool) appear at hubs; arcs and pulses run from the room to them |
| 10 Close | night | every light back home, now linked to the room and each other: the region lit and connected |

Builders are warm sodium-streetlight amber. Investors and connections are cool Biscayne aqua. The two CTAs inherit those colors (Apply to build = amber, Investor = aqua), so color carries meaning everywhere.

## Visual system: Daylight Studio

- Night ink `#07090c`, paper `#f1ede4`, ink text `#0e1013`, amber `#ffb347`, aqua `#46e0c9`.
- Type: Funnel Display (statements), Funnel Sans (body), Newsreader italic (human voice), Geist Mono (coordinates, labels).
- Motion: weighted Lenis scroll, GSAP ScrollTrigger scrub for chapters, one easing family (expo out for reveals, power2 inOut for scrub).
- No stock photography and no fabricated people, quotes, investors, or numbers.

## Page map and copy

1 Hero, 2 The turn, 3 The room (Build / Trade / Team up), 4 How it works (Apply, Join the room, Show the work, Meet the money; each row has a tiny dot diagram in the same language), 5 The pipeline (+ investor line), 6 Who it's for ("Bring proof, not a pitch."), 7 Why here (Hialeah coordinates), 8 House rules (Ship, Share, Show up), 9 FAQ, 10 Close, footer.

Separate routes: `/apply/` (builder) and `/investors/` (investor). One question per screen, keyboard first; on submit the visitor's own light appears in their city and travels to the room.

Copy rules: no em-dashes, plain words, short sentences, premium tone.

## Fallbacks and quality

- All copy and CTAs are real DOM; the stage is decoration (`aria-hidden`).
- No WebGL: designed SVG map poster. Reduced motion: no scrub, each chapter shows its composed end state, cross-fades only.
- Mobile is re-staged: the peninsula is portrait, so the map fills a phone vertically; fewer particles, DPR capped.
- Gates: 0 console errors, axe clean, keyboard complete, 375/768/1440 verified, Lighthouse mobile perf 90+.

## Content dependencies (Joe to confirm)

FAQ answers (cost, hours, selection, equity), form endpoint, exact address, domain, social links, investor partner names (none shown until confirmed).
