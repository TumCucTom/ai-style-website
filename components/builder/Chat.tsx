"use client";

// The home page before anything is built: it looks and works like a chat app.
// The sidebar's "chats" are the sections of the site, each answered from the
// data files, for anyone who would rather click than describe a website.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContactGate } from "@/components/ContactGate";
import type { Content } from "./Site";

type Version = { href: string; kind: string; name: string; line: string };
type Turn = { prompt: string; name: string };
type ChatId = "mine" | "upgrade" | "what" | "projects" | "experience" | "education" | "wins" | "sport" | "live" | "contact";

// Not real. Nothing here can be bought.
const plans = (rapid: number | null): { name: string; price: string; per: string; line: string; perks: string[]; cta: string }[] => [
  { name: "Free", price: "£0", per: "forever", line: "Everything on this site. That's the whole product.", perks: ["All five versions", "Unlimited pages", "The puzzle, unskipped or skipped"], cta: "Your current plan" },
  { name: "Plus", price: "£4.99", per: "a month", line: "The same website, but you feel better about it.", perks: ["A slightly warmer hello", "Dark mode (also in Free)", "A sense of having supported something"], cta: "Upgrade to Plus" },
  { name: "Pro", price: `£${(rapid ?? 1272).toLocaleString("en-GB")}`, per: "a month", line: "Priced at my live chess.com rapid rating. It goes up if I improve.", perks: ["I play you at chess and probably lose", "Priority access to the keyword rules", "Your name said aloud, once"], cta: "Upgrade to Pro" },
  { name: "Enterprise", price: "226 km", per: "per seat", line: "I do an Ironman on behalf of your team.", perks: ["Guaranteed to start, guaranteed-ish to finish", "A dedicated account swimmer", "Invoices in kilometres only"], cta: "Talk to sales (me)" },
];

const CHATS: { id: Exclude<ChatId, "mine" | "upgrade">; title: string; ask: string }[] = [
  { id: "what", title: "What is this?", ask: "what is this?" },
  { id: "projects", title: "What have you made?", ask: "what have you made?" },
  { id: "experience", title: "Where have you worked?", ask: "where have you worked?" },
  { id: "education", title: "Where did you study?", ask: "where did you study?" },
  { id: "wins", title: "Hackathons and competitions", ask: "have you won anything?" },
  { id: "sport", title: "Away from the desk", ask: "what do you do when you're not working?" },
  { id: "live", title: "What are you up to this week?", ask: "what are you up to this week?" },
  { id: "contact", title: "How do I get in touch?", ask: "how do I get in touch?" },
];

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Rows({ items }: { items: { name: string; href?: string; meta: string; line: string }[] }) {
  return (
    <ul className="chat-rows">
      {items.map((it) => (
        <li key={it.name + it.meta}>
          <span>
            {it.href ? (
              <a href={it.href} target="_blank" rel="noreferrer">
                <b>{it.name}</b>
              </a>
            ) : (
              <b>{it.name}</b>
            )}
            <i>{it.meta}</i>
          </span>
          {it.line}
        </li>
      ))}
    </ul>
  );
}

/** The built page, drawn at desktop width and scaled down to fit the card. It can't be clicked or tabbed into. */
function Preview({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 1280, k: 0.5 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      // phones get the phone layout, so the preview shows what they'd actually see
      const w = window.innerWidth >= 900 ? 1280 : 440;
      setFit({ w, k: el.clientWidth / w });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="chat-shot" ref={box} aria-hidden="true">
      <div inert style={{ width: fit.w, transform: `scale(${fit.k})` }}>
        {children}
      </div>
    </div>
  );
}

type Props = {
  content: Content;
  versions: readonly Version[];
  run: (ask: string) => void;
  focus: () => void;
  /** what the visitor has asked for so far, oldest first */
  turns: Turn[];
  message: string;
  /** the request being worked on, while a model is thinking */
  pending: string;
  by: string;
  openUrl: string | null;
  onOpen: () => void;
  stage: ReactNode;
  /** the studio's copy-and-paste steps, shown as a reply */
  studio: ReactNode;
};

export function ChatHome({ content, versions, run, focus, turns, message, pending, by, openUrl, onOpen, stage, studio }: Props) {
  const [chat, setChat] = useState<ChatId>("what");
  // Open shows a page live in a pane beside the chat, the way a chat app shows what it made
  const [pane, setPane] = useState<{ title: string; src: string; mine: boolean } | null>(null);
  useEffect(() => {
    // the pane follows the page being built
    setPane((p) => (p?.mine ? (openUrl ? { ...p, src: openUrl, title: turns.at(-1)?.name ?? p.title } : null) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUrl]);
  // the studio is a follow-up in the first chat, already asked, not a place to go
  const more = useRef<HTMLDivElement>(null);
  const askStudio = () => {
    setChat("what");
    setOpen(false);
    setTimeout(() => more.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const openMine = (name: string) => (openUrl ? setPane({ title: name, src: openUrl, mine: true }) : onOpen());
  // asking for a page starts a chat of its own, the way a first message does in a chat app
  const count = turns.length + (pending ? 1 : 0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (count > 0) {
      setChat("mine");
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } else setChat((c) => (c === "mine" ? "what" : c));
  }, [count]);
  const [open, setOpen] = useState(false);
  // the same light/dark setting the rest of the site uses
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  const flip = () => {
    const next = !light;
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
    setLight(next);
  };
  const pick = (id: ChatId) => {
    setChat(id);
    setOpen(false);
    window.scrollTo({ top: 0 });
  };
  const try_ = (ask: string) => (
    <a href="/" onClick={(e) => (e.preventDefault(), run(ask))}>
      {ask}
    </a>
  );
  const l = content.live;

  const reply: Record<Exclude<ChatId, "mine">, ReactNode> = {
    upgrade: (
      <>
        <p>You&apos;re on Free, which already has everything. But if you insist, here are the plans:</p>
        <ul className="chat-plans">
          {plans(l.rapid).map((pl, i) => (
            <li key={pl.name} className={i === 2 ? "hot" : ""}>
              {i === 2 && <em>Most ambitious</em>}
              <b>{pl.name}</b>
              <p className="price">
                {pl.price} <i>{pl.per}</i>
              </p>
              <p>{pl.line}</p>
              <ul>
                {pl.perks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <button type="button" disabled={i === 0} onClick={() => document.getElementById("plan-contact")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                {pl.cta}
              </button>
            </li>
          ))}
        </ul>
        <div className="chat-plan-contact" id="plan-contact">
          <b>Talk to sales</b>
          <p className="price">
            Free <i>one puzzle</i>
          </p>
          <p>Sales is me. Solve this and you get my details with a code to quote. Or skip it and get them without the code.</p>
          <ContactGate bare />
        </div>
        <p className="llm-dim">None of the plans are real and there&apos;s nothing to buy. Getting in touch is, and it&apos;s free.</p>
      </>
    ),
    what: (
      <>
        <p>
          It&apos;s my website. I&apos;m <b>Tom Bale</b>, a product engineer at Anima, in London.
        </p>
        <p>
          I couldn&apos;t settle on one design, so you pick. Type what you want in the box at the bottom, something like {try_("a terminal")},{" "}
          {try_("like a newspaper")} or {try_("warm and calm")}, and I'll build it and show you here. Then keep going: make it dark, drop the sport, only the
          quantum work.
        </p>
        <p>If you&apos;d rather just read, the chats in the sidebar answer the usual questions. Or open a version I made earlier:</p>
        <ol id="versions" className="llm-cards">
          {versions.map((v) => {
            // the CV is another site, so it only opens in a tab
            const here = v.href.startsWith("/");
            const show = () => setPane({ title: v.name, src: v.href, mine: false });
            return (
              <li key={v.href} className="chat-card">
                {here ? (
                  <div className="chat-card-shot" onClick={show}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/previews/${v.kind}.jpg`} alt="" width={960} height={600} loading="lazy" />
                  </div>
                ) : (
                  <a className="chat-card-shot" href={v.href} target="_blank" rel="noopener" tabIndex={-1} aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/previews/${v.kind}.jpg`} alt="" width={960} height={600} loading="lazy" />
                  </a>
                )}
                <div className="chat-card-foot">
                  <p>
                    <b>{v.name}</b>
                    <i>{v.line}</i>
                  </p>
                  {here && (
                    <button type="button" onClick={show}>
                      Open
                    </button>
                  )}
                  <a href={v.href} target="_blank" rel="noopener">
                    Open in new tab
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
        <p>
          One more thing. If you have your own Claude or ChatGPT, it can design a version too, and it will do a better job than anything running in this
          page. I call that the studio.
        </p>
      </>
    ),
    projects: (
      <>
        <p>Mostly side projects. These are the ones I&apos;d show you first:</p>
        <Rows items={content.projects.slice(0, 8).map((p) => ({ name: p.name, href: p.href, meta: [p.domain, p.year].filter(Boolean).join(" · "), line: p.tagline }))} />
        <p>
          There are {content.projects.length} in all. <Link href="/paper#work" target="_blank" rel="noopener">The paper</Link> lists every one, or ask for {try_("only the quantum work")}.
        </p>
      </>
    ),
    experience: (
      <>
        <p>Newest first:</p>
        <Rows items={content.jobs.map((j) => ({ name: j.role, meta: `${j.org} · ${j.dates}`, line: j.summary }))} />
        <p>
          <a href="https://cv.thomasbale.com" target="_blank" rel="noopener">The CV</a> has the detail on each.
        </p>
      </>
    ),
    education: (
      <>
        <p>Bristol for the degree, Essex before that:</p>
        <Rows items={content.schools.map((s) => ({ name: s.name, meta: s.dates, line: `${s.qualification}. ${s.grade.replaceAll(",", ", ")}` }))} />
      </>
    ),
    wins: (
      <>
        <p>A fair few hackathons, some of which went well:</p>
        <Rows items={content.wins.map((w) => ({ name: w.name, meta: String(w.year), line: w.blurb }))} />
      </>
    ),
    sport: (
      <>
        <p>Mostly things that involve getting tired:</p>
        <Rows items={content.sport.map((s) => ({ name: s.name, meta: String(s.year), line: s.blurb }))} />
      </>
    ),
    live: (
      <>
        <p>These numbers refresh on their own, so they&apos;re honest:</p>
        <div className="chat-nums">
          <div>
            <b>{l.c24}</b>commits in the last 24 hours
          </div>
          <div>
            <b>{l.c7}</b>commits in the last 7 days
          </div>
          {l.rapid && (
            <div>
              <b>{l.rapid}</b>chess.com rapid rating
            </div>
          )}
        </div>
        {l.track && (
          <p>
            Last thing I listened to was <b>{l.track.name}</b> by {l.track.artist}.
          </p>
        )}
        <p>
          You can also <Link href="/chess" target="_blank" rel="noopener">play a bot that plays like me</Link>.
        </p>
      </>
    ),
    contact: (
      <>
        <p>My details are behind a small puzzle. Solve it and you get them with a code to quote, so I know you did. Or skip it and get them without the code.</p>
        <div className="chat-gate">
          <ContactGate bare />
        </div>
      </>
    ),
  };
  const mine = turns[0]?.prompt || pending || "New page";
  const now = chat === "mine" ? { title: mine, ask: "" } : chat === "upgrade" ? { title: "Upgrade plan", ask: "what do I get if I upgrade?" } : CHATS.find((c) => c.id === chat)!;

  return (
    <>
      <header className="chat-top">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Chats and links">
          <Icon d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
        </button>
        <span>{now.title}</span>
        <button type="button" className="chat-up" onClick={() => pick("upgrade")}>
          <Icon d="M8 1.8c.5 3.2 1.4 4.6 4.7 5.2-3.3.6-4.2 2-4.7 5.2-.5-3.2-1.4-4.6-4.7-5.2 3.3-.6 4.2-2 4.7-5.2zM13 11.2c.2 1.2.5 1.7 1.7 1.9-1.2.2-1.5.7-1.7 1.9-.2-1.2-.5-1.7-1.7-1.9 1.2-.2 1.5-.7 1.7-1.9z" />
          Upgrade plan
        </button>
        <button type="button" className="chat-theme" onClick={flip} aria-label={light ? "Switch to dark" : "Switch to light"}>
          {light ? <Icon d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" /> : <Icon d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z" />}
        </button>
      </header>
      {open && <button type="button" className="chat-scrim" aria-label="Close" onClick={() => setOpen(false)} />}
      <aside className={`chat-side${open ? " open" : ""}`} aria-label="Chats and links">
        <p className="chat-brand">Tom Bale</p>
        <a className="chat-source" href="https://github.com/TumCucTom/ai-style-website" target="_blank" rel="noopener">
          <Icon d="M6 3 2.5 8 6 13M10 3l3.5 5-3.5 5" />
          <span>
            <b>Like this?</b>
            <i>Here&apos;s the source code</i>
          </span>
          <em aria-hidden="true">↗</em>
        </a>
        <nav className="chat-cta" aria-label="Start here">
          <button type="button" onClick={() => (setOpen(false), focus())}>
            <Icon d="M8 3v10M3 8h10" />
            New page
          </button>
          <button type="button" onClick={() => pick("contact")}>
            <Icon d="M2.5 4.5h11v7h-11zM2.5 5l5.5 4 5.5-4" />
            Get in touch
          </button>
          <a href="https://cv.thomasbale.com" target="_blank" rel="noopener">
            <Icon d="M4.5 2.5h5l2 2v9h-7zM6.5 7h3M6.5 9.5h3" />
            Read the CV
          </a>
        </nav>
        <p className="chat-k">Chats</p>
        <ul>
          {count > 0 && (
            <li>
              <button type="button" onClick={() => pick("mine")} aria-current={chat === "mine" ? "page" : undefined}>
                {mine}
              </button>
            </li>
          )}
          {CHATS.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => pick(c.id)} aria-current={c.id === chat ? "page" : undefined}>
                {c.title}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={askStudio}>
              Tell me about the studio
            </button>
          </li>
        </ul>
        <p className="chat-k">Made by hand</p>
        <ul>
          {versions.map((v) => (
            <li key={v.href}>
              <Link href={v.href} target="_blank" rel="noopener">{v.name}</Link>
            </li>
          ))}
        </ul>
        <p className="chat-me">
          <span aria-hidden="true">T</span>
          <b>Tom Bale</b>
          <i>Product engineer, Anima</i>
        </p>
      </aside>
      {pane && (
        <aside className="chat-pane" aria-label={`Preview of ${pane.title}`}>
          <header>
            <b>{pane.title}</b>
            <a href={pane.src} target="_blank" rel="noopener">
              Open in new tab
            </a>
            <button type="button" onClick={() => setPane(null)} aria-label="Close preview">
              <Icon d="M4 4l8 8M12 4l-8 8" />
            </button>
          </header>
          <iframe key={pane.src} src={pane.src} title={pane.title} />
        </aside>
      )}
      <main className="llm-chat" key={chat}>
        <h1 className="llm-sr">Tom Bale</h1>
        {chat !== "mine" ? (
          <>
            <div className="llm-msg llm-me">
              <p>{now.ask}</p>
            </div>
            <div className="llm-msg llm-it">
              <div className="llm-say">{reply[chat]}</div>
            </div>
            {chat === "what" && (
              <div className="chat-turn chat-more" ref={more}>
                <div className="llm-msg llm-me">
                  <p>wait, I can change the website myself? tell me more about the studio</p>
                </div>
                <div className="llm-msg llm-it">
                  <div className="llm-say">
                    <p>
                      The models that run in this page are small. The studio lets a proper one design my site: it writes the layout, the stylesheet and
                      the headings, and the facts still come from my data.
                    </p>
                    <p>
                      Say what you want, send the prompt to your own Claude or ChatGPT, and paste what it says back here. Nothing
                      of yours comes to me.
                    </p>
                    <div className="chat-studio">{studio}</div>
                    <p>Every page you make has its own link, so you can share it. It&apos;s under Share in the box below once you&apos;ve built one.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {turns.map((t, i) => {
              const last = i === turns.length - 1;
              return (
                <div className="chat-turn" key={i}>
                  <div className="llm-msg llm-me">
                    <p>{t.prompt || "a shared link"}</p>
                  </div>
                  <div className="llm-msg llm-it">
                    <div className="llm-say">
                      {last && !pending ? (
                        <>
                          <p>{message || `Here's “${t.name}”.`}</p>
                          <div className="chat-card">
                            {/* a picture of the page; the Open button below is the control */}
                            <div className="chat-card-shot" onClick={() => openMine(t.name)}>
                              <Preview>{stage}</Preview>
                            </div>
                            <div className="chat-card-foot">
                              <p>
                                <b>{t.name}</b>
                                <i>My website, built by {by.charAt(0).toLowerCase() + by.slice(1)}</i>
                              </p>
                              <button type="button" onClick={() => openMine(t.name)}>
                                Open
                              </button>
                              {openUrl && (
                                <a href={openUrl} target="_blank" rel="noopener">
                                  Open in new tab
                                </a>
                              )}
                            </div>
                          </div>
                          <p className="llm-dim">Keep going in the box below: make it dark, fewer projects, a different layout.</p>
                        </>
                      ) : (
                        <p className="llm-dim">Built “{t.name}”. Changed since.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {pending && (
              <div className="chat-turn">
                <div className="llm-msg llm-me">
                  <p>{pending}</p>
                </div>
                <div className="llm-msg llm-it">
                  <p className="chat-wait" role="status">
                    <span className="llm-sr">Working on it</span>
                    <i />
                    <i />
                    <i />
                  </p>
                </div>
              </div>
            )}
            <div ref={end} className="chat-end" />
          </>
        )}
      </main>
    </>
  );
}
