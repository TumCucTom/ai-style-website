"use client";

import { useEffect, useRef, useState } from "react";

const LINKS = [
  ["#abstract", "abstract"],
  ["#now", "now"],
  ["#work", "work"],
  ["#map", "map"],
  ["#experience", "experience"],
  ["#results", "results"],
  ["#contact", "contact"],
];

// The scrollbar is an Ironman: 3.8 km swim, 180 km bike, 42.2 km run.
const LEGS = [
  { name: "swim", km: 3.8, to: 0.2, color: "var(--swim)" },
  { name: "bike", km: 180, to: 0.65, color: "var(--bike)" },
  { name: "run", km: 42.2, to: 1, color: "rgb(var(--accent-rgb))" },
];

export function Nav() {
  const bar = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const leg = useRef<HTMLElement>(null);
  const dist = useRef<HTMLSpanElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      bar.current?.style.setProperty("--p", String(p));
      chip.current?.toggleAttribute("data-start", scrollY < 40);
      let from = 0;
      for (const l of LEGS) {
        if (p <= l.to || l === LEGS[2]) {
          const done = p >= 0.999;
          const km = ((p - from) / (l.to - from)) * l.km;
          chip.current?.style.setProperty("--leg", l.color);
          if (leg.current) leg.current.textContent = done ? "finish" : l.name;
          if (dist.current)
            dist.current.textContent = done
              ? "226 km · 10:30"
              : `${km.toFixed(l.km < 10 ? 2 : 1)} / ${l.km} km`;
          break;
        }
        from = l.to;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <>
      <div id="race-bar" ref={bar} aria-hidden="true" />
      <header className="fixed inset-x-0 top-[3px] z-50 border-b border-line bg-bg/95 backdrop-blur-md">
        <nav className="wrap flex h-12 items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="flex items-center gap-3">
            <a href="#top" className="font-semibold text-ink hover:text-accent">
              T. Bale
            </a>
            <a href="/#versions" className="all-versions inline">
              <span aria-hidden="true">←</span> all versions
            </a>
          </span>
          <ul className="hidden items-center gap-5 text-muted md:flex">
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="transition-colors hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="flex h-[30px] items-center rounded-full border border-line px-3 text-muted transition-colors duration-150 hover:border-ink hover:text-ink"
          >
            {theme === "dark" ? "paper" : "night"}
          </button>
        </nav>
      </header>
      <div
        id="race-chip"
        ref={chip}
        data-start=""
        title="The scrollbar is an Ironman. Mine was Switzerland 2024, in 10h30."
      >
        <i />
        <b ref={leg}>swim</b>
        <span ref={dist} className="tabular">
          0.00 / 3.8 km
        </span>
      </div>
    </>
  );
}
