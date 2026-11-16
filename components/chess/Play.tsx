"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import data from "@/data/chess-style.json";
import tomData from "@/data/chess-tom.json";
import { ContactGate } from "@/components/ContactGate";
import { choose, contextOf, MAIA_URL, type Choice, type Tom } from "./bot";
import { loadNet, type Net } from "./maia";
import { place, start, sq, type Color, type Placed } from "./game";
import { SHAPES } from "./pieces";
import type { Props } from "./ChessGame";

type Games = {
  castle: { king: number; queen: number; never: number };
  games: number;
  from: string;
  to: string;
  record: { win: number; draw: number; loss: number };
  asWhite: number;
  firstMoves: [string, number][];
  vsE4: [string, number][];
  lossBy: Record<string, number>;
  accuracy: { mean: number; games: number } | null;
};
const style = data as unknown as Games;
const tom = tomData as unknown as Tom;
// If the games file is ever empty the bot still works, it just isn't me.
const learnt = tom.fit.games > 0 && Object.keys(tom.book).length > 0;
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Twenty games against Stockfish with its strength capped; see the report in scripts/chess-fit.mjs.
const STRENGTH = "Over twenty games against Stockfish capped at 1320 it won eleven and lost nine.";

/** What to say under the board about the move the bot just made. */
function tell(pick: Choice, san: string, bot: Color): string {
  switch (pick.why) {
    case "book": {
      const times = pick.played === 1 ? "once" : `${pick.played} times`;
      return pick.seen! > pick.played! ? `I've played ${san} here ${times}, out of ${pick.seen}.` : `I've played ${san} here ${times}.`;
    }
    case "setup":
      return bot === "w" ? "London set-up. I get this in most games." : "Same set-up as always: g6, Bg7, c5.";
    case "battery":
      return "Queen and bishop lined up at your h-pawn. I always do this.";
    case "hfile":
      return "Pushing the h-pawn at your king. I like an open h-file.";
    case "trick":
      return "This is the one I'm always hoping for: bishop takes on h7, then g8, then mate.";
    case "mate":
      return "Saw that one.";
    default:
      return "";
  }
}

const FILES = "abcdefgh";
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
// "30 May to 14 Nov 2026" when both ends are in the same year
const span = (a: string, b: string) => `${a.slice(0, 4) === b.slice(0, 4) ? day(a).replace(/ \d{4}$/, "") : day(a)} to ${day(b)}`;
const sum = (rows: [string, number][]) => rows.reduce((a, [, n]) => a + n, 0);

type Over = { title: string; line: string };

export function Play({ user, profileUrl, ratings }: Props) {
  const game = useRef(new Chess());
  const board = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [you, setYou] = useState<Color | null>(null);
  const [pieces, setPieces] = useState<Placed[]>(start);
  const [sans, setSans] = useState<string[]>([]);
  const [last, setLast] = useState<{ from: number; to: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; from: number; moved: boolean } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState("");
  const [over, setOver] = useState<Over | null>(null);
  const inBook = useRef(true);
  // Maia: fetched when a game starts. Until it arrives, or if it never does,
  // the bot plays from my own numbers alone.
  const maia = useRef<Net | null>(null);
  const [net, setNet] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  const flip = you === "b";
  const rapid = ratings.find((r) => r.name === "rapid")?.rating;
  const turn = sans.length % 2 === 0 ? "w" : "b";
  const yours = !!you && !over && !thinking && turn === you;

  const targets = useMemo(
    () => (sel === null || !yours ? [] : game.current.moves({ square: (FILES[sel & 7] + ((sel >> 3) + 1)) as Move["from"], verbose: true })),
    // sans changes whenever the position does
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, yours, sans],
  );

  const finish = useCallback(
    (bot: Color) => {
      const g = game.current;
      if (!g.isGameOver()) return false;
      if (g.isCheckmate()) {
        const botLost = g.turn() === bot;
        const mates = style.lossBy?.checkmated;
        setOver(
          botLost
            ? {
                title: "Checkmate. You won.",
                line: learnt && mates ? `That's in character. ${mates} of my ${style.record.loss} losses in those games ended in mate.` : "Well played.",
              }
            : { title: "Checkmate.", line: "That one goes to the bot. The real me would like a go as well." },
        );
      } else if (g.isStalemate()) setOver({ title: "Stalemate.", line: "A draw. Nobody's happy." });
      else if (g.isThreefoldRepetition()) setOver({ title: "Draw.", line: "Same position three times." });
      else if (g.isInsufficientMaterial()) setOver({ title: "Draw.", line: "There isn't enough left on the board to mate with." });
      else setOver({ title: "Draw.", line: "Fifty moves without a capture or a pawn move." });
      return true;
    },
    [],
  );

  const commit = useCallback((m: Move) => {
    setPieces((p) => place(p, m));
    setSans((s) => [...s, m.san]);
    setLast({ from: sq(m.from), to: sq(m.to) });
    setSel(null);
  }, []);

  const botMove = useCallback(
    (bot: Color) => {
      setThinking(true);
      // the search takes a few milliseconds; the pause is so it doesn't feel like a machine gun
      timer.current = window.setTimeout(() => {
        const g = game.current;
        const past = g.history({ verbose: true });
        const fens = past.length ? [past[0].before, ...past.map((h) => h.after)] : [g.fen()];
        const ctx = contextOf(fens, past.map((h) => h.from + h.to + (h.promotion ?? "")), bot);
        const pick = choose(ctx, tom, maia.current);
        const m = g.move(pick.move);
        const said = tell(pick, m.san, bot);
        if (pick.why === "book") setNote(said);
        else {
          setNote(said || (inBook.current && learnt && fens[0] === START ? "Never been here before. From now on it's guessing what I'd do." : ""));
          inBook.current = false;
        }
        commit(m);
        setThinking(false);
        finish(bot);
      }, 450 + Math.random() * 500);
    },
    [commit, finish],
  );

  const begin = (c: Color) => {
    clearTimeout(timer.current);
    game.current = new Chess();
    inBook.current = true;
    setYou(c);
    setPieces(start());
    setSans([]);
    setLast(null);
    setSel(null);
    setPromo(null);
    setOver(null);
    setNote("");
    setThinking(false);
    if (!maia.current && net !== "loading") {
      setNet("loading");
      loadNet(MAIA_URL).then(
        (n) => {
          maia.current = n;
          setNet("ready");
        },
        () => setNet("failed"),
      );
    }
    if (c === "b") botMove("w");
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Development only: drop any position on the board, to look at the screens
  // that are hard to reach by playing (promotion, stalemate, the draws).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __chess?: unknown };
    w.__chess = {
      game,
      load(fen: string, side: Color = "w") {
        clearTimeout(timer.current);
        const g = new Chess(fen);
        game.current = g;
        inBook.current = false;
        const placed: Placed[] = [];
        g.board().forEach((row) =>
          row.forEach((c) => {
            if (c) placed.push({ id: `x${placed.length}`, kind: c.type, color: c.color, sq: sq(c.square), alive: true });
          }),
        );
        setYou(side);
        setPieces(placed);
        // keeps the move parity right, so whose turn it is matches the FEN
        setSans(g.turn() === "w" ? [] : ["…"]);
        setLast(null);
        setSel(null);
        setPromo(null);
        setOver(null);
        setNote("");
        setThinking(false);
        if (g.turn() !== side && !g.isGameOver()) botMove(g.turn());
      },
    };
    return () => void delete w.__chess;
  }, [botMove]);

  const play = (from: string, to: string, promotion?: string) => {
    if (!you) return;
    let m: Move;
    try {
      m = game.current.move({ from, to, promotion });
    } catch {
      return; // chess.js said no
    }
    setPromo(null);
    commit(m);
    const bot = you === "w" ? "b" : "w";
    if (!finish(bot)) botMove(bot);
  };

  const attempt = (to: number) => {
    const hits = targets.filter((m) => sq(m.to) === to);
    if (!hits.length) return false;
    if (hits[0].promotion) setPromo({ from: hits[0].from, to: hits[0].to });
    else play(hits[0].from, hits[0].to);
    return true;
  };

  // ----- pointer: click a piece then a square, or drag it there -----
  const at = (e: React.PointerEvent) => {
    const r = board.current!.getBoundingClientRect();
    const fx = Math.min(7, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 8)));
    const fy = Math.min(7, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 8)));
    return { s: flip ? fy * 8 + (7 - fx) : (7 - fy) * 8 + fx, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  };
  const down = (e: React.PointerEvent) => {
    if (!yours || promo) return;
    const { s, x, y } = at(e);
    if (sel !== null && attempt(s)) return;
    const mine = pieces.find((p) => p.alive && p.sq === s && p.color === you);
    if (!mine) return setSel(null);
    setSel(s);
    setDrag({ id: mine.id, x, y, from: s, moved: false });
    board.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = at(e);
    setDrag({ ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.x, y - drag.y) > 5 });
  };
  const up = (e: React.PointerEvent) => {
    if (!drag) return;
    const { s } = at(e);
    if (drag.moved && s !== drag.from) attempt(s);
    setDrag(null);
  };

  const checked = !over && game.current.inCheck() ? pieces.find((p) => p.alive && p.kind === "k" && p.color === turn)?.sq : undefined;
  const mated = over && game.current.isCheckmate() ? pieces.find((p) => p.alive && p.kind === "k" && p.color === turn)?.sq : undefined;
  const status = !you
    ? "Pick a side."
    : over
      ? over.title
      : thinking
        ? "Thinking…"
        : game.current.inCheck()
          ? "You're in check."
          : "Your move.";

  const firstTotal = sum(style.firstMoves ?? []);
  const e4Total = sum(style.vsE4 ?? []);

  return (
    <>
      <div className="cg-stage">
        <div className="cg-boardrow">
          <div
            ref={board}
            className={`cg-board is-live ${yours ? "is-yours" : ""}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setDrag(null)}
            role="application"
            aria-label={`Chess board. ${status}`}
          >
            {Array.from({ length: 64 }, (_, i) => {
              const top = i >> 3;
              const left = i & 7;
              const rank = flip ? top : 7 - top;
              const file = flip ? 7 - left : left;
              const s = rank * 8 + file;
              const t = targets.find((m) => sq(m.to) === s);
              const cls = [
                "cg-sq",
                (rank + file) % 2 ? "l" : "d",
                last && (s === last.from || s === last.to) ? "hot" : "",
                s === sel ? "sel" : "",
                t ? (t.captured ? "cap" : "tgt") : "",
                s === checked ? "chk" : "",
                s === mated ? "dead" : "",
              ].join(" ");
              return (
                <div key={i} className={cls}>
                  {left === 0 && <b className="rk">{rank + 1}</b>}
                  {top === 7 && <b className="fl">{FILES[file]}</b>}
                </div>
              );
            })}
            {pieces.map((p) => {
              const x = flip ? 7 - (p.sq & 7) : p.sq & 7;
              const y = flip ? p.sq >> 3 : 7 - (p.sq >> 3);
              const held = drag?.id === p.id && drag.moved;
              return (
                <svg
                  key={p.id}
                  viewBox="0 0 100 100"
                  className={`cg-pc ${p.color} ${p.alive ? "" : "gone"} ${held ? "held" : ""} ${last && p.alive && p.sq === last.to ? "moved" : ""}`}
                  style={{
                    transform: held
                      ? `translate(calc(${drag!.x}px - 50%), calc(${drag!.y}px - 50%)) scale(1.15)`
                      : `translate(${x * 100}%, ${y * 100}%)${p.alive ? "" : " scale(0.3)"}`,
                  }}
                  aria-hidden="true"
                >
                  {SHAPES[p.kind]}
                </svg>
              );
            })}
            {promo && you && (
              <div className="cg-promo" role="dialog" aria-label="Promote to">
                {(["q", "r", "b", "n"] as const).map((k) => (
                  <button key={k} onClick={() => play(promo.from, promo.to, k)} onPointerDown={(e) => e.stopPropagation()} aria-label={{ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[k]}>
                    <svg viewBox="0 0 100 100" className={`cg-pc ${you}`}>
                      {SHAPES[k]}
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cg-live">
          <p className="cg-status" role="status">
            <b>{status}</b>
            {note && !over && <span>{note}</span>}
          </p>
          <p className={`cg-acts ${you ? "" : "pick"}`}>
            {!you && (
              <>
                <button onClick={() => begin("w")}>I&apos;ll take White</button>
                <button onClick={() => begin("b")}>I&apos;ll take Black</button>
              </>
            )}
            {you && (
              <>
              {!over && sans.length > 1 && (
                <button
                  onClick={() => {
                    clearTimeout(timer.current);
                    setThinking(false);
                    setSel(null);
                    setDrag(null);
                    setPromo(null);
                    setOver({ title: "You resigned.", line: "Fair enough. I do it too." });
                  }}
                >
                  Resign
                </button>
              )}
              <button onClick={() => begin(you)}>New game</button>
              <button onClick={() => begin(you === "w" ? "b" : "w")}>Swap sides</button>
              </>
            )}
          </p>
          {sans.length > 0 && (
            <ol className="cg-list live" aria-label="Moves so far">
              {Array.from({ length: Math.ceil(sans.length / 2) }, (_, n) => (
                <li key={n}>
                  <i>{n + 1}.</i>
                  <span>{sans[n * 2]}</span>
                  {sans[n * 2 + 1] && <span>{sans[n * 2 + 1]}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="cg-play">
        {over ? (
          <section className="cg-over">
            <p className="cg-caps">Game over</p>
            <h1>{over.title}</h1>
            <p className="cg-note">{over.line}</p>
            <p className="cg-acts big">
              <button onClick={() => begin(you ?? "w")}>Another</button>
              <a href={profileUrl} target="_blank" rel="noreferrer">
                Play the real me on chess.com ↗
              </a>
            </p>
          </section>
        ) : (
          <section>
            <h1>
              Play me<span className="cg-mark">.</span>
            </h1>
            {learnt ? (
              <p className="cg-note">
                Well, a bot of me. It&apos;s been through {tom.fit.games} of my games and picks the move I&apos;d play about{" "}
                {Math.round(tom.fit.top1.maia)}% of the time. That includes the bad ones.
              </p>
            ) : (
              <p className="cg-note">
                My games haven&apos;t been loaded, so for now this is a plain club-level bot. It doesn&apos;t play like me.
              </p>
            )}
            {net === "loading" && <p className="cg-net">Fetching Maia (1.3 MB). Until it arrives the bot plays from my numbers alone.</p>}
            {net === "failed" && (
              <p className="cg-net">
                Maia didn&apos;t load, so this is the bot without it. That one picks my move {Math.round(tom.fit.top1.plain)}% of the
                time and is easier to beat.
              </p>
            )}
            {learnt && (
              <details className="cg-how">
                <summary>How it works</summary>
                <p>
                  It read my games on chess.com from {span(tom.fit.from, tom.fit.to)}. It knows my openings: the London as
                  White, and g6, Bg7, c5 against more or less anything as Black.
                </p>
                <p>
                  Once the position is new it leans on{" "}
                  <a href="https://github.com/CSSLab/maia-chess" target="_blank" rel="noreferrer">
                    Maia
                  </a>
                  , a small network trained to guess what club players do, and nudges that towards my habits: where my
                  pieces usually go, castling long, the queen and bishop lined up at h7.
                </p>
                <p>
                  I tested it on my newest {tom.fit.heldGames} games, which it wasn&apos;t allowed to see. Its first choice was
                  my move {tom.fit.top1.maia}% of the time. The bot this replaced managed {tom.fit.top1.old}%. Maia alone,
                  knowing nothing about me, gets {tom.fit.top1.maiaAlone}%. {STRENGTH}
                </p>
                <p className="cg-small">
                  Maia is by McIlroy-Young, Sen, Kleinberg and Anderson. Its weights are GPL, so they aren&apos;t in my code.
                  Your browser fetches them from the Maia repository when you start a game.
                </p>
              </details>
            )}
          </section>
        )}

        {learnt && <p className="cg-caps cg-facts-k">From those games</p>}
        {learnt && (
          <ul className="cg-facts">
            {firstTotal > 0 && (
              <li>
                As White I play {style.firstMoves[0][0]}. {style.firstMoves[0][1]} of {firstTotal} games.
              </li>
            )}
            {e4Total > 0 && (
              <li>
                Against e4 I play {style.vsE4[0][0]}: {style.vsE4[0][1]} of {e4Total}.
              </li>
            )}
            <li>
              Queen and bishop on one diagonal, aimed at h7: {tom.fit.battery} of my {tom.fit.whiteGames} games as White.
            </li>
            <li>
              A bishop has gone into h7 in {tom.fit.bxh7} of them. The whole thing (Bxh7, Bg8, Qh7 mate down the h‑file)
              has come off {tom.fit.trick === 1 ? "once" : `${tom.fit.trick} times`}.
            </li>
            <li>
              I castle short in {Math.round(style.castle.king)}% of games, long in {Math.round(style.castle.queen)}%, and not at
              all in {Math.round(style.castle.never)}%.
            </li>
            {style.accuracy && (
              <li>
                chess.com puts me at {style.accuracy.mean}% accuracy over the {style.accuracy.games} games it reviewed.
              </li>
            )}
            <li>
              {style.record.win} won, {style.record.loss} lost, {style.record.draw} drawn.
            </li>
          </ul>
        )}

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

        <p className="cg-chess">If you&apos;d rather talk than play:</p>
        <div className="cg-gate">
          <ContactGate bare />
        </div>
      </div>
    </>
  );
}
