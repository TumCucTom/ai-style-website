"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContactGate } from "@/components/ContactGate";
import { GAME, PLIES, positions, sq } from "./game";
import { SHAPES } from "./pieces";

// chess.js, the bot and my games only load if someone actually wants a game
const Play = dynamic(() => import("./Play").then((m) => m.Play), { ssr: false, loading: () => <p className="cg-loading">Setting up the board…</p> });

export type Props = {
  user: string;
  profileUrl: string;
  ratings: { name: string; rating: number | null; best: number | null }[];
  builds: { name: string; tagline: string; href: string }[];
};

const FILES = "abcdefgh";

export function ChessGame(props: Props) {
  const [mode, setMode] = useState<"story" | "play">("story");

  useEffect(() => {
    const read = () => setMode(location.hash === "#play" ? "play" : "story");
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);

  const pick = (m: "story" | "play") => {
    setMode(m);
    history.replaceState(null, "", m === "play" ? "#play" : location.pathname);
    scrollTo({ top: 0 });
  };

  return (
    <main className={`cg is-${mode}`}>
      <a className="all-versions" href="/#versions">
        <span aria-hidden="true">←</span> all versions
      </a>
      <div className="cg-modes" role="tablist" aria-label="What to do with the board">
        <button role="tab" aria-selected={mode === "story"} onClick={() => pick("story")}>
          The game
        </button>
        <button role="tab" aria-selected={mode === "play"} onClick={() => pick("play")}>
          Play me
        </button>
      </div>
      {mode === "story" ? <Story {...props} onPlay={() => pick("play")} /> : <Play {...props} />}
    </main>
  );
}

function Story({ user, profileUrl, ratings, builds, onPlay }: Props & { onPlay: () => void }) {
  const boards = useMemo(() => positions(), []);
  const last = PLIES.length; // step index of the final ply
  const total = last + 2; // intro + plies + outro
  const [step, setStep] = useState(0);
  const steps = useRef<(HTMLElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);

  // step 0 is the intro, 1..33 are plies, 34 is the outro (board stays mated)
  const ply = Math.min(step, last);
  const board = boards[ply];
  const move = ply > 0 ? PLIES[ply - 1] : null;
  const mate = ply === last;

  // Where the reader's eye is: mid-screen on desktop, mid-way below the
  // pinned board on a phone.
  const focusY = useCallback(() => {
    const s = stage.current;
    if (s && matchMedia("(max-width: 899px)").matches) {
      const b = s.getBoundingClientRect().bottom;
      return b + (innerHeight - b) / 2;
    }
    return innerHeight / 2;
  }, []);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = focusY();
      let best = 0;
      let bd = Infinity;
      steps.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      setStep(best);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, [focusY]);

  const go = useCallback(
    (i: number) => {
      const el = steps.current[Math.max(0, Math.min(total - 1, i))];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: scrollY + (r.top + r.bottom) / 2 - focusY(), behavior: reduced ? "auto" : "smooth" });
    },
    [focusY, total],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        go(step + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        go(step - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(total - 1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [go, step, total]);

  const moveNo = (i: number) => Math.floor(i / 2) + 1;
  const blackKing = board.find((p) => p.kind === "k" && p.color === "b")!;

  return (
    <>
      <div className="cg-stage" ref={stage}>
        <div className="cg-boardrow">
          {/* reads like an eval bar; it is only how far through the game we are */}
          <div className="cg-bar" aria-hidden="true">
            <i style={{ height: `${(ply / last) * 100}%` }} />
            <span>{mate ? GAME.result : `${Math.ceil(ply / 2)}/17`}</span>
          </div>

          <div className={`cg-board ${mate ? "is-mate" : ""}`} role="img" aria-label={move ? `Position after ${moveNo(ply - 1)}${ply % 2 ? "." : "…"} ${move.san}` : "Starting position"}>
            {Array.from({ length: 64 }, (_, i) => {
              const rank = 7 - Math.floor(i / 8);
              const file = i % 8;
              const s = rank * 8 + file;
              const hot = move && (s === sq(move.from) || s === sq(move.to));
              return (
                <div key={i} className={`cg-sq ${(rank + file) % 2 ? "l" : "d"} ${hot ? "hot" : ""} ${mate && s === blackKing.sq ? "dead" : ""}`}>
                  {file === 0 && <b className="rk">{rank + 1}</b>}
                  {rank === 0 && <b className="fl">{FILES[file]}</b>}
                </div>
              );
            })}
            {board.map((p) => (
              <svg
                key={p.id}
                viewBox="0 0 100 100"
                className={`cg-pc ${p.color} ${p.alive ? "" : "gone"} ${move && p.alive && p.sq === sq(move.to) ? "moved" : ""}`}
                style={{ transform: `translate(${(p.sq % 8) * 100}%, ${(7 - Math.floor(p.sq / 8)) * 100}%)${p.alive ? "" : " scale(0.3)"}` }}
                aria-hidden="true"
              >
                {SHAPES[p.kind]}
              </svg>
            ))}
          </div>
        </div>

        <div className="cg-ctl">
          <button onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous move">
            ←
          </button>
          <button onClick={() => go(step + 1)} disabled={step === total - 1} aria-label="Next move">
            →
          </button>
          <span>scroll, or use the arrow keys</span>
        </div>

        <ol className="cg-list" aria-label="Move list">
          {Array.from({ length: 17 }, (_, n) => (
            <li key={n}>
              <i>{n + 1}.</i>
              {[n * 2, n * 2 + 1].map(
                (i) =>
                  PLIES[i] && (
                    <button key={i} className={i + 1 === ply ? "on" : i + 1 < ply ? "done" : ""} onClick={() => go(i + 1)}>
                      {PLIES[i].san}
                      {PLIES[i].mark}
                    </button>
                  ),
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="cg-steps">
        <section ref={(el) => void (steps.current[0] = el)} className={`cg-step intro ${step === 0 ? "on" : ""}`}>
          <p className="cg-caps">Tom Bale</p>
          <h1>
            A career
            <br />
            in 17 moves<span className="cg-mark">.</span>
          </h1>
          <p className="cg-note">
            The moves aren&apos;t mine. They&apos;re the Opera Game: {GAME.white} against {GAME.black}, {GAME.place}. It&apos;s
            short, well known and long out of copyright. I&apos;ve written what I was doing in the margins of White&apos;s
            moves.
          </p>
          <p className="cg-chess">
            White to play. Scroll. Or skip the reading and{" "}
            <button className="cg-link" onClick={onPlay}>
              play me
            </button>
            .
          </p>
        </section>

        {PLIES.map((p, i) => {
          const white = i % 2 === 0;
          return (
            <section
              key={i}
              ref={(el) => void (steps.current[i + 1] = el)}
              className={`cg-step ${white ? "w" : "b"} ${step === i + 1 ? "on" : ""}`}
            >
              {p.year && <p className="cg-caps">{p.year}</p>}
              <h2>
                <span className="cg-n">
                  {moveNo(i)}
                  {white ? "." : "…"}
                </span>
                {p.san}
                {p.mark && <span className="cg-mark">{p.mark}</span>}
              </h2>
              {p.chess && <p className="cg-chess">{p.chess}</p>}
              {p.note && <p className="cg-note">{p.note}</p>}
            </section>
          );
        })}

        <section ref={(el) => void (steps.current[total - 1] = el)} className={`cg-step outro ${step === total - 1 ? "on" : ""}`}>
          <p className="cg-caps">{GAME.result}</p>
          <h2>
            Black resigns<span className="cg-mark">.</span>
          </h2>
          <p className="cg-note">
            Morphy found those moves. I only wrote in the margins. My own chess looks more like this, straight from
            chess.com:
          </p>
          <a className="cg-ratings" href={profileUrl} target="_blank" rel="noreferrer">
            {ratings.map((r) => (
              <span key={r.name}>
                <i>{r.name}</i>
                <b>{r.rating}</b>
                <em>peak {r.best}</em>
              </span>
            ))}
            <span className="who">{user} on chess.com ↗</span>
          </a>
          <p className="cg-chess">
            You can{" "}
            <button className="cg-link" onClick={onPlay}>
              play a bot of me
            </button>{" "}
            if you want to see for yourself. I&apos;m better at building chess than playing it:
          </p>
          <ul className="cg-builds">
            {builds.map((b) => (
              <li key={b.href}>
                <a href={b.href} target="_blank" rel="noreferrer">
                  <b>{b.name} ↗</b>
                  <span>{b.tagline}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="cg-chess">If you&apos;d rather talk than play:</p>
          <div className="cg-gate">
            <ContactGate bare />
          </div>
        </section>
      </div>
    </>
  );
}
