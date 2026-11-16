// What a model is told. The same brief goes to a visitor's own Claude by
// copy and paste, to the API with their key, and (cut down) to a model
// running in the browser.

import { BLOCK_GUIDE, type Design } from "./design";
import type { Content } from "./Site";

/** The facts a designer needs in order to choose and to write headings. All of it is from the data files. */
export function digest(c: Content): string {
  const byDomain: Record<string, number> = {};
  c.projects.forEach((p) => (byDomain[p.domain] = (byDomain[p.domain] ?? 0) + 1));
  return [
    "Tom Bale, product engineer, London.",
    `Jobs: ${c.jobs.map((j) => `${j.role}, ${j.org} (${j.dates})`).join("; ")}.`,
    `Education: ${c.schools.map((s) => `${s.qualification}, ${s.name} (${s.dates})`).join("; ")}.`,
    `Projects: ${c.projects.length} in total (${Object.entries(byDomain).map(([k, n]) => `${k} ${n}`).join(", ")}). The first few: ${c.projects.slice(0, 8).map((p) => `${p.name} (${p.tagline})`).join("; ")}.`,
    `Hackathons and competitions: ${c.wins.length}, e.g. ${c.wins.slice(0, 4).map((w) => w.name).join("; ")}.`,
    `Sport and interests: ${c.sport.map((s) => s.name).join("; ")}.`,
  ].join("\n");
}

const ROLE = `You are designing a personal website for Tom Bale because a visitor to his site asked for a particular version of it. You return one JSON object, {"name", "frame", "css", "blocks"}, and the site builds the page from it: it renders your blocks with fixed HTML, fills them with Tom's real data, and applies your stylesheet.

Design it properly. Commit to one clear visual idea that fits the request, and carry it through layout, type, colour, spacing and imagery: you can pull pictures, GIFs, short clips and fonts from the web. Choose the frame (the page's skeleton) to suit the idea, and use the grid (span) to put blocks side by side where that helps. Two requests should not come out as the same page in different colours. Write a complete stylesheet for the idea, usually 50 to 150 lines, and make sure text is readable on its background.

Two rules that are not negotiable:
1. Facts come from the data, not from you. The lists (projects, jobs, results and so on) are filled in by the site. In the words you do write (block titles, the hero line, text blocks, a marquee) do not state anything about Tom that is not in ABOUT TOM below. No invented employers, dates, numbers or claims.
2. Unless the visitor asks for another voice, write as Tom would: first person, casual, plain, a bit dry. No superlatives, no slogans.`;

const OUTPUT = `Reply with the JSON object only, in a \`\`\`json code block, with no other text. Shape:
{"name": "two or three words", "frame": "stack | rail | bento | paper | poster | index", "fonts": ["optional Google Fonts family"], "css": "…the whole stylesheet as one string…", "blocks": [{"type": "hero", "variant": "giant", "title": "…", "text": "…", "span": 12, "limit": 9, "focus": [], "images": true, "cls": "", "src": ""}, …]}`;

/** The full brief, for a capable model. `current` makes it an edit rather than a fresh start. */
export function brief(content: Content, current: Design | null): string {
  return [
    ROLE,
    BLOCK_GUIDE,
    `ABOUT TOM (the only facts you may refer to):\n${digest(content)}`,
    current ? `THE CURRENT VERSION (change it as asked; keep what was not mentioned):\n${JSON.stringify(current)}` : "",
    OUTPUT,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Brief plus the visitor's wish, as one message to paste into their own assistant. */
export const pastePrompt = (content: Content, current: Design | null, ask: string) =>
  `${brief(content, current)}\n\nWHAT THE VISITOR WANTS:\n${ask.trim() || "(write what you want here, then send)"}`;

/** A cut-down brief for a small model with a 4,096-token window. */
export const LOCAL_BRIEF = `You design a personal website for Tom Bale, a product engineer in London. Reply with one JSON object: {"name", "css", "blocks"}.
blocks is a list of {"type","variant","title","text","span","limit","focus","images","cls"}:
- hero: variant giant|split|quiet|terminal|masthead; title = big line; text = one sentence.
- projects: grid|list|table|cards|marquee; limit = how many.
- experience: timeline|list|table. education: list|cards. wins: list|table|grid. sport: list|grid.
- live: bignum|row|ticker. text: plain|lead|aside (text = one or two sentences). marquee (text). divider. contact (always include).
span is width out of 12 (12 full, 6 half, 4 third). focus is [] or any of ai,hpc,quantum,f1,ios,web,games,defi,puzzles. cls is "".
css is a stylesheet string. Classes: .fs (page: set background, color, font-family), .b (a block), .b-title (block heading), .hero-title, .hero-sub, .items, .item, .item-name, .item-line, .item-meta, .item-img, .num-v, .num-k, .text-body. No url(), no @import.
Do not invent facts about Tom. Titles are short, casual, first person. Every design is different: choose colours, fonts and variants that fit THIS request, and write at least ten CSS rules.
Three examples of the format. Do not copy their colours.

Request: dark green terminal, just projects
{"name":"Green terminal","css":".fs{background:#041007;color:#4dff88;font-family:ui-monospace,monospace}.b-title{text-transform:uppercase;letter-spacing:.1em;border-bottom:1px dashed #4dff88;padding-bottom:.4rem}.item-name{color:#b6ffce}.item-line{opacity:.7}.hero-title{font-family:ui-monospace,monospace;font-size:2.4rem}","blocks":[{"type":"hero","variant":"terminal","title":"tom bale","text":"I build software. Here is some of it.","span":12,"limit":1,"focus":[],"images":false,"cls":""},{"type":"projects","variant":"table","title":"ls projects/","text":"","span":12,"limit":12,"focus":[],"images":false,"cls":""},{"type":"contact","variant":"plain","title":"say hi","text":"","span":12,"limit":1,"focus":[],"images":false,"cls":""}]}

Request: old newspaper front page
{"name":"Morning edition","css":".fs{background:#f4efe1;color:#1a1714;font-family:Georgia,'Times New Roman',serif}.hero-title{font-family:Georgia,serif;font-size:5rem;letter-spacing:0;text-align:center}.hero-sub{font-style:italic;text-align:center;margin-inline:auto}.b{border-top:3px double #1a1714;padding-top:1rem}.b-title{font-variant:small-caps;font-size:1.3rem;letter-spacing:.06em}.items{column-rule:1px solid #1a171455}.item-name{font-size:1.15rem}.item-meta{font-family:Georgia,serif;font-style:italic}.num-v{font-family:Georgia,serif}","blocks":[{"type":"hero","variant":"masthead","title":"The Tom Bale Gazette","text":"All the projects fit to print.","span":12,"limit":1,"focus":[],"images":false,"cls":""},{"type":"experience","variant":"list","title":"Employment","text":"","span":4,"limit":12,"focus":[],"images":false,"cls":""},{"type":"projects","variant":"grid","title":"Today's projects","text":"","span":8,"limit":9,"focus":[],"images":true,"cls":""},{"type":"wins","variant":"table","title":"Results","text":"","span":12,"limit":8,"focus":[],"images":false,"cls":""},{"type":"contact","variant":"plain","title":"Letters to the editor","text":"","span":12,"limit":1,"focus":[],"images":false,"cls":""}]}

Request: playful, pink, rounded, friendly
{"name":"Bubblegum","css":".fs{background:#ffe3f1;color:#4a0e2e;font-family:system-ui,sans-serif}.hero-title{color:#e6007a;font-size:5.5rem}.b{background:#fff;border-radius:28px;padding:1.6rem;box-shadow:0 8px 0 #ffb3d6}.b-hero{background:none;box-shadow:none}.b-title{color:#e6007a;font-size:1.4rem}.item{background:#fff5fa;border-radius:18px;padding:.9rem}.item-name{color:#b0005c}.num-v{color:#e6007a}.item-img{border-radius:14px}","blocks":[{"type":"hero","variant":"giant","title":"Hi, I'm Tom.","text":"I make things. Have a look.","span":12,"limit":1,"focus":[],"images":false,"cls":""},{"type":"live","variant":"bignum","title":"This week","text":"","span":12,"limit":4,"focus":[],"images":false,"cls":""},{"type":"projects","variant":"cards","title":"Things I made","text":"","span":8,"limit":8,"focus":[],"images":true,"cls":""},{"type":"sport","variant":"list","title":"Away from the desk","text":"","span":4,"limit":6,"focus":[],"images":false,"cls":""},{"type":"contact","variant":"plain","title":"Say hi","text":"","span":12,"limit":1,"focus":[],"images":false,"cls":""}]}`;
