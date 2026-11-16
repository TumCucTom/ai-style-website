"use client";

import { useEffect, useState } from "react";
import { PUZZLES, isCorrect, type Puzzle } from "@/lib/puzzles";
import unlockKeys from "@/data/unlock-keys.json";
import "./contact-gate.css";

// Contact details are only put on the page once the visitor solves a puzzle
// or says they'd rather not. They are stored reversed so they are not sitting
// in the served HTML for a scraper; this is a speed bump, not security.
const rev = (s: string) => s.split("").reverse().join("");
const CONTACT = [
  { k: "email", v: "moc.kooltuo@elabkot", href: (v: string) => `mailto:${v}` },
  { k: "linkedin", v: "elab-samoht/ni/moc.nideknil", href: (v: string) => `https://www.${v}` },
  { k: "github", v: "moTcuCmuT/moc.buhtig", href: (v: string) => `https://${v}` },
];

const LEVEL = ["", "easy", "medium", "hard"];
const KEY = "tb-contact";

type State = { open: boolean; code: string };

/**
 * The contact block for every version of the site. Locked: one puzzle, with
 * "a different one" and "skip". Solving it shows the details and a code to
 * quote; skipping shows the details and no code.
 */
export function ContactGate({ bare = false, className = "" }: { bare?: boolean; className?: string }) {
  const [state, setState] = useState<State>({ open: false, code: "" });
  const [puzzle, setPuzzle] = useState<Puzzle>(PUZZLES[0]);
  const [input, setInput] = useState("");
  const [wrong, setWrong] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    setPuzzle(PUZZLES[Math.floor(Math.random() * PUZZLES.length)]);
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {}
  }, []);

  function save(next: State) {
    setState(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  function another() {
    const others = PUZZLES.filter((p) => p !== puzzle);
    setPuzzle(others[Math.floor(Math.random() * others.length)]);
    setInput("");
    setWrong(false);
    setHint(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isCorrect(puzzle, input)) return setWrong(true);
    const keys = unlockKeys as string[];
    const code = `${keys[Math.floor(Math.random() * keys.length)]}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    save({ open: true, code });
  }

  const cls = `gate ${bare ? "bare" : ""} ${className}`;

  if (state.open)
    return (
      <div className={cls}>
        {state.code ? (
          <>
            <p className="gate-k">Solved. Quote this when you write</p>
            <p className="gate-code">{state.code}</p>
          </>
        ) : (
          <p className="gate-k">Skipped, so no code. Fair enough.</p>
        )}
        <ul className="gate-list">
          {CONTACT.map((c) => {
            const v = rev(c.v);
            return (
              <li key={c.k}>
                <span>{c.k}</span>
                <a href={c.href(v)} target={c.k === "email" ? undefined : "_blank"} rel="noreferrer">
                  {v}
                </a>
              </li>
            );
          })}
        </ul>
        {!state.code && (
          <p className="gate-links">
            <button onClick={() => save({ open: false, code: "" })}>go back and do the puzzle</button>
          </p>
        )}
      </div>
    );

  return (
    <div className={cls}>
      <p className="gate-k">
        Contact is behind a puzzle · {puzzle.kind.replace("-", " ")} · {LEVEL[puzzle.difficulty]}
      </p>
      <p className="gate-t">{puzzle.title}</p>
      <p className="gate-p">{puzzle.prompt}</p>
      <form onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setWrong(false);
          }}
          placeholder="your answer"
          aria-label="Answer"
          aria-invalid={wrong || undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="gate-go">check</button>
      </form>
      {wrong && (
        <p className="gate-msg" role="status">
          Not that. Try again, or skip it.
        </p>
      )}
      {hint && puzzle.hint && <p className="gate-msg">Hint: {puzzle.hint}</p>}
      <p className="gate-links">
        {puzzle.hint && <button onClick={() => setHint(!hint)}>{hint ? "hide hint" : "hint"}</button>}
        <button onClick={another}>a different one</button>
        <button onClick={() => save({ open: true, code: "" })}>skip it (you get no code)</button>
      </p>
    </div>
  );
}
