# Personal Portfolio Website

If you like it feel free to fork and provide credit.

You can visit it at [thomasbale.com](https://thomasbale.com)

Or see my old ones at: [v1.thomasbale.com](https://v1.thomasbale.com) and [v2.thomasbale.com](https://v2.thomasbale.com)

## v4

The home page is a builder: the visitor describes the site they want and it is
re-made from a small validated JSON spec (`components/builder`). A keyword
stand-in runs by default; a real model (WebLLM, WebGPU) downloads only if the
visitor asks for it. Under the prompt are the hand-made versions:

| Route | What |
|---|---|
| `/` | the builder: describe a site and the page becomes it |
| `/studio` | get your own Claude or ChatGPT to design it, by copy and paste (strict CSP on this route) |
| `/tunnel` | the whole page is a lattice Boltzmann wind tunnel |
| `/world` | a three.js globe; walk around seven of the places. Bristol, Monaco and MIT use baked OpenStreetMap outlines (`node scripts/bake-osm.mjs`) |
| `/chess` | a career annotated onto Morphy's Opera Game, and a bot that plays like me: Maia-1300 re-weighted by my own games (`node scripts/chess-games.mjs`, then `npx tsx scripts/chess-fit.mjs`). Maia's weights (GPL-3.0) are fetched from its repository at play time, not committed |
| `/paper` | the long read: figures, tables, the live map |

Contact details are never in the served HTML: every version shows them through
`components/ContactGate.tsx`, after a puzzle or an explicit skip.

Notes on the paper version:


`/paper` is written as a living paper. Two things on it are computed in the
browser, both in hand-written WebGL with no libraries:

- **Fig. 1, the hero** (`lib/flow.ts`): a D2Q9 lattice Boltzmann wind tunnel.
  Anything marked `data-flow-text` is rasterised into the lattice as a solid,
  so the name sheds vortices; `data-flow-solid` boxes are obstacles too.
  Without WebGL2 float render targets the plain heading shows instead.
- **Fig. 4, the map** (`lib/umap.ts`): the nodes of `data/constellation.json`
  in 3D. The data is packed by `lib/map-data.ts`, served as `/map.json`, and
  only fetched when the figure nears the viewport.

Runtime dependencies are `next` and `react`, plus `three` (`/world` only) and `chess.js` (`/chess` only). One web font (Bricolage
Grotesque) is downloaded; body and data text use system faces. Scroll
animations are CSS scroll-driven animations, so they cost no JavaScript.

## GitHub activity

The live numbers are GitHub contributions, read from the public contribution
calendar on the profile page (`github.com/users/thomas-bale/contributions`), so
they are the numbers on the heatmap: the last seven days, the last year, and
each recent day. Dates are UTC days, as the public calendar draws them.

It reads the page rather than the API because the API, with the tokens a
workflow has, leaves out contributions the profile includes (work in private
organisations). No token is needed. If the page can't be fetched or doesn't
parse, the previous numbers are kept and the snapshot is marked stale.

`npm run contributions` prints the current numbers.

Run `npm test` for the contributions-parser and git-refresh regression tests.


## The CV

The CV is a separate site at https://cv.thomasbale.com (an update of the v2 site in `thomas-bale/personal-website`, folder `cv-website`). This repo only links to it.
