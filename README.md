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

The live wall counts unique commit SHAs over rolling 24-hour and seven-day
windows. It combines authored commits found by GitHub commit search with commits
in merged PRs authored or personally merged by TumCucTom, including agent-authored
PRs. PR commits use the PR's merge timestamp. If a SHA appears more than once,
its earliest qualifying activity within the seven-day snapshot wins. Therefore
this measures authored/delivered commits, not GitHub profile contributions, PR
counts, lines of code, or only commits first written during the window. Branch
sync commits contained in qualifying PRs are included too.

`GH_USER_TOKEN` must belong to TumCucTom and have read access to the repositories
being measured. For a classic PAT this requires private-repository `repo` access
and any organisation SSO authorisation. For a fine-grained PAT, grant repository
contents and pull-request read access across the desired repositories; ensure
the token supports all owners being measured. The collector verifies access to
serenity, anima-service and anima-clinics-app before publishing a new snapshot.
It cannot infer access to every other private repository, so token selection
still defines coverage. The workflow's repository-scoped `GITHUB_TOKEN` is used
for pushing data, never as a fallback activity token.

Both `npm run commits` and the scheduled `scripts/fetch-all.mjs` use the same
collector. Search intervals split above 1,000 results; repository, PR and commit
connections paginate. API errors and incomplete search responses fail collection
rather than becoming zeros. Scheduled refresh failures retain the previous
counts and timestamp and mark the snapshot stale. Private repository names,
messages and links never enter the generated detail lists or top-repository
labels. `refresh: live data` commits are excluded.

Run `npm test` for the activity and git-refresh regression tests.


## The CV

The CV is a separate site at https://cv.thomasbale.com (an update of the v2 site in `TumCucTom/personal-website`, folder `cv-website`). This repo only links to it.
