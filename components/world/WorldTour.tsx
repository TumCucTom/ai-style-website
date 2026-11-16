"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CREDITS, STOPS, WALKABLE, coords, km, nextRaceStop, type Race, type Stop } from "./stops";
import type { Scene } from "./scene";
import type { Walk } from "./walk";
import type { Exhibit } from "./places";

/**
 * A few places. The page is one tall scroll: each screen of scroll is one
 * leg, and the camera flies the great circle between the two places. Some
 * stops have a small scene you can go into and walk around.
 */
export function WorldTour({ races }: { races: Race[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // One leg is one row of the track. Measure the row rather than assume it is
  // innerHeight: the rows are 100svh, which is not always the same number.
  const unit = useCallback(() => track.current?.firstElementChild?.getBoundingClientRect().height || innerHeight, []);
  const scene = useRef<Scene | null>(null);
  const odo = useRef<HTMLSpanElement>(null);
  // null until mounted: the last stop depends on today's date
  const [list, setList] = useState<Stop[] | null>(null);
  const stops = list ?? STOPS;
  const [at, setAt] = useState(0); // 0 = title, k = stop k
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // going into a place: the globe camera drops, then a second canvas takes over
  const placeCanvas = useRef<HTMLCanvasElement>(null);
  const walk = useRef<Walk | null>(null);
  const pin = useRef<HTMLButtonElement>(null);
  const atRef = useRef(0);
  const insideRef = useRef<string | null>(null);
  const [diving, setDiving] = useState(false);
  const [inside, setInside] = useState<string | null>(null);
  const [near, setNear] = useState<Exhibit | null>(null);
  atRef.current = at;
  insideRef.current = inside ?? (diving ? "diving" : null);

  useEffect(() => {
    const race = nextRaceStop(races, Date.now());
    setList(race ? [...STOPS, race] : STOPS);
  }, [races]);

  // cumulative km flown on arriving at each stop
  const flown = stops.map((_, i) => stops.slice(1, i + 1).reduce((sum, s, j) => sum + km(stops[j], s), 0));

  useEffect(() => {
    if (!list) return;
    const stops = list;
    let dead = false;
    let made: Scene | null = null;
    const legs = stops.map((s, i) => (i ? km(stops[i - 1], s) : 0));
    import("./scene")
      .then(({ createScene }) => {
        if (dead) return;
        made = createScene(canvas.current!, stops, (f) => {
          // keep the "go in" label on the pin of the stop you are at
          const b = pin.current;
          if (b) {
            const k = atRef.current - 1;
            const p = k >= 0 && WALKABLE.has(stops[k].id) && Math.abs(f - atRef.current) < 0.02 && !insideRef.current ? made?.pinAt(k) : null;
            b.style.visibility = p ? "visible" : "hidden";
            if (p) b.style.transform = `translate(${p.x}px, ${p.y}px)`;
          }
          if (!odo.current) return;
          // the odometer runs with the flight
          const leg = Math.max(0, f - 1);
          const k = Math.min(legs.length - 2, Math.floor(leg));
          const t = Math.min(1, leg - k);
          const e = t * t * t * (t * (t * 6 - 15) + 10);
          let total = 0;
          for (let i = 1; i <= k; i++) total += legs[i];
          if (k + 1 < legs.length) total += legs[k + 1] * e;
          odo.current.textContent = Math.round(total).toLocaleString("en-GB");
        });
        scene.current = made;
        made.setTarget(scrollY / unit(), true);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      made?.dispose();
      scene.current = null;
    };
  }, [list]);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const f = scrollY / unit();
      scene.current?.setTarget(f);
      setAt(Math.max(0, Math.min(stops.length, Math.round(f))));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [stops.length]);

  const go = useCallback(
    (k: number) => {
      const to = Math.max(0, Math.min(stops.length, k));
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: to * unit(), behavior: calm ? "auto" : "smooth" });
    },
    [stops.length, unit],
  );

  const enter = useCallback(
    (k: number) => {
      const s = stops[k];
      if (!s || !WALKABLE.has(s.id) || insideRef.current) return;
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setDiving(true);
      scene.current?.dive(true);
      window.setTimeout(
        () => {
          setInside(s.id);
          scene.current?.pause(true);
        },
        calm || !scene.current ? 0 : 950,
      );
    },
    [stops],
  );

  const leave = useCallback(() => {
    history.replaceState(null, "", location.pathname);
    setInside(null);
    setNear(null);
    setDiving(false);
    scene.current?.pause(false);
    scene.current?.dive(false);
  }, []);

  // /world#bristol opens straight inside Bristol
  useEffect(() => {
    if (!list) return;
    const id = location.hash.slice(1);
    const k = list.findIndex((s) => s.id === id);
    if (k < 0 || !WALKABLE.has(id)) return;
    scrollTo(0, (k + 1) * unit());
    setDiving(true);
    setInside(id);
  }, [list]);

  // the place itself: built when you arrive, thrown away when you leave
  useEffect(() => {
    if (!inside) return;
    let dead = false;
    history.replaceState(null, "", `#${inside}`);
    document.documentElement.style.overflow = "hidden";
    let themes: MutationObserver | null = null;
    import("./walk").then(({ createWalk }) => {
      if (dead) return;
      walk.current = createWalk(placeCanvas.current!, inside, setNear);
      // a place is painted in the theme you arrived in; if the theme changes
      // while you are inside, paint it again
      let was = document.documentElement.classList.contains("light");
      themes = new MutationObserver(() => {
        const now = document.documentElement.classList.contains("light");
        if (now === was || dead) return;
        was = now;
        walk.current?.dispose(false);
        setNear(null);
        walk.current = createWalk(placeCanvas.current!, inside, setNear);
      });
      themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    });
    return () => {
      dead = true;
      themes?.disconnect();
      document.documentElement.style.overflow = "";
      walk.current?.dispose();
      walk.current = null;
    };
  }, [inside]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (insideRef.current) {
        if (e.key === "Escape") leave();
        return; // the arrows walk now
      }
      if (e.key === "Enter" && !(e.target as HTMLElement)?.closest?.("a,button")) {
        enter(atRef.current - 1);
        return;
      }
      const here = Math.round(scrollY / unit());
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(here + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(here - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [go, enter, leave]);

  const n = stops.length;
  const here = inside ? stops.find((s) => s.id === inside) : null;
  const pad = (v: number) => String(v).padStart(2, "0");

  return (
    <div className="wt" data-diving={diving} data-inside={!!inside}>
      {/* one screen of scroll per leg; these are also the snap points */}
      <div className="wt-track" ref={track} aria-hidden="true">
        {Array.from({ length: n + 1 }, (_, i) => (
          <div key={i} />
        ))}
      </div>

      <div className="wt-stage">
        <canvas ref={canvas} className={ready ? "is-ready" : ""} aria-hidden="true" />
        <div className="wt-vignette" aria-hidden="true" />

        <header className="wt-top">
          <Link href="/#versions" className="all-versions inline">
            <span aria-hidden="true">←</span> all versions
          </Link>
          <span className="wt-odo">
            <span ref={odo}>0</span> km flown
          </span>
        </header>

        <section className="wt-title" data-on={at === 0} aria-hidden={at !== 0}>
          <p className="wt-eyebrow">{n} places</p>
          <h1>
            Tom
            <br />
            Bale
          </h1>
          <p className="wt-lede">
            I&apos;m a product engineer in London. These are the places things happened. You can walk around most of
            them.
          </p>
          <button className="wt-go" onClick={() => go(1)} tabIndex={at === 0 ? 0 : -1}>
            Start <span aria-hidden="true">→</span>
          </button>
          {failed && <p className="wt-eyebrow">The globe needs WebGL, which this browser isn&apos;t giving me. The stops still work.</p>}
        </section>

        {stops.map((s, i) => (
          <article key={s.id} className="wt-stop" data-on={at === i + 1} aria-hidden={at !== i + 1}>
            <p className="wt-eyebrow">
              <b>
                {pad(i + 1)} / {pad(n)}
              </b>
              <span>{s.when}</span>
              <span>{coords(s)}</span>
            </p>
            <h2 style={{ "--len": s.place.length } as React.CSSProperties}>{s.place}</h2>
            <p className="wt-kicker">{s.kicker}</p>
            {s.lines.map((l) => (
              <p key={l} className="wt-line">
                {l}
              </p>
            ))}
            {s.stat && (
              <dl className="wt-stats">
                {s.stat.map((x) => (
                  <div key={x.k}>
                    <dt>{x.k}</dt>
                    <dd>{x.v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {WALKABLE.has(s.id) && !failed && (
              <button className="wt-in" onClick={() => enter(i)} tabIndex={at === i + 1 ? 0 : -1}>
                Walk around it <span aria-hidden="true">↓</span>
              </button>
            )}
            {i > 0 && (
              <p className="wt-leg">
                ↗ {Math.round(km(stops[i - 1], s)).toLocaleString("en-GB")} km from {stops[i - 1].place} ·{" "}
                {Math.round(flown[i]).toLocaleString("en-GB")} km so far
              </p>
            )}
          </article>
        ))}

        <button ref={pin} className="wt-pin" onClick={() => enter(atRef.current - 1)} tabIndex={-1} aria-hidden="true">
          <i />
          go in
        </button>

        <nav className="wt-nav" aria-label="Stops">
          <button onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous stop">
            ←
          </button>
          <ol>
            {Array.from({ length: n + 1 }, (_, i) => (
              <li key={i}>
                <button
                  onClick={() => go(i)}
                  aria-label={i === 0 ? "Title" : stops[i - 1].place}
                  aria-current={at === i ? "step" : undefined}
                  title={i === 0 ? "Title" : stops[i - 1].place}
                />
              </li>
            ))}
          </ol>
          <button onClick={() => go(at + 1)} disabled={at === n} aria-label="Next stop">
            →
          </button>
        </nav>
        <p className="wt-hint" data-on={at === 0}>
          scroll, or use the arrow keys
        </p>
        <div className="wt-flash" aria-hidden="true" />
      </div>

      {inside && (
        <div className="wt-place">
          <canvas ref={placeCanvas} aria-label={`A small 3D scene for ${here?.place}. Walk with W A S D or the arrow keys.`} />
          <header>
            <button onClick={leave}>
              ← back to the globe <kbd>esc</kbd>
            </button>
            <span>{here?.place}</span>
          </header>
          <aside className="wt-exhibit" data-on={!!near} aria-live="polite">
            {near && (
              <>
                <h3>{near.title}</h3>
                <p>{near.body}</p>
                {near.link && (
                  <a href={near.link.href} target="_blank" rel="noreferrer">
                    {near.link.label} ↗
                  </a>
                )}
              </>
            )}
          </aside>
          <p className="wt-controls" data-on={!near}>
            <span className="wt-keys">W A S D or arrows to walk · shift to run · drag to look</span>
            <span className="wt-touch">Drag to look · hold the button to walk</span>
            <span>The orange markers have notes</span>
          </p>
          {here && CREDITS[here.id] && <p className="wt-credit">{CREDITS[here.id]}</p>}
          <button
            className="wt-walk"
            onPointerDown={(e) => {
              walk.current?.forward(true);
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {}
            }}
            onPointerUp={() => walk.current?.forward(false)}
            onPointerCancel={() => walk.current?.forward(false)}
            onLostPointerCapture={() => walk.current?.forward(false)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Hold to walk forward"
          >
            walk
          </button>
        </div>
      )}
    </div>
  );
}
