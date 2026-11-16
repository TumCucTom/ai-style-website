"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { UMap, type Cluster, type MapState } from "@/lib/umap";

const idle: MapState = { selected: -1, cluster: -1, query: "", matches: 0 };
const noop = () => () => {};

export function MapFigure({ clusters, total }: { clusters: Cluster[]; total: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<UMap | null>(null);
  const state = useSyncExternalStore(map?.subscribe ?? noop, map?.getState ?? (() => idle), () => idle);
  const sel = map && state.selected >= 0 ? map.describe(state.selected) : null;

  // The data and the renderer only load once the figure is nearly on screen.
  useEffect(() => {
    let m: UMap | null = null;
    let dead = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        fetch("/map.json")
          .then((r) => r.json())
          .then((data) => {
            if (dead) return;
            m = new UMap(canvas.current!, tip.current!, labels.current!, data);
            if (m.init()) setMap(m);
          })
          .catch(() => {});
      },
      { rootMargin: "600px" },
    );
    io.observe(frame.current!);
    return () => {
      dead = true;
      io.disconnect();
      m?.destroy();
    };
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={state.query}
          onChange={(e) => map?.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && map?.select(map.firstMatch())}
          placeholder={`search ${total} nodes, e.g. pytorch`}
          aria-label="Search the map"
          className="h-9 w-64 max-w-full rounded-full border border-line bg-surface px-3.5 font-mono text-xs text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        {state.query && <span className="font-mono text-[11px] tabular text-muted">{state.matches} found · enter to fly there</span>}
        <span className="ml-auto flex gap-1.5">
          <button className="chip flex h-9 w-9 items-center justify-center !p-0 text-sm hover:text-ink" onClick={() => map?.zoomBy(1.3)} aria-label="Zoom in">+</button>
          <button className="chip flex h-9 w-9 items-center justify-center !p-0 text-sm hover:text-ink" onClick={() => map?.zoomBy(1 / 1.3)} aria-label="Zoom out">−</button>
        </span>
      </div>

      <div ref={frame} className="map-frame plate mt-3">
        <canvas ref={canvas} aria-label="Interactive 3D map of projects, repos, roles and tools" />
        <div ref={labels} className="map-labels" aria-hidden="true" />
        <div ref={tip} className="map-tip" aria-hidden="true" />
        {!map && <p className="absolute inset-0 grid place-items-center font-mono text-xs text-muted">loading {total} nodes…</p>}
        {sel && (
          <aside className="absolute bottom-3 left-3 right-3 border border-line bg-surface/95 p-4 backdrop-blur md:left-auto md:w-80">
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                <i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: sel.cluster.color }} />
                {sel.kind} · {sel.cluster.name}
              </p>
              <button onClick={() => map?.select(-1)} className="font-mono text-[11px] text-muted hover:text-ink" aria-label="Close">esc</button>
            </div>
            <p className="mt-2 font-sans text-xl font-bold leading-tight tracking-tight">{sel.name}</p>
            {sel.meta.o && <p className="mt-1 text-sm text-muted">Used in {sel.meta.o}.</p>}
            {sel.meta.t && <p className="mt-1 text-sm leading-snug text-muted">{sel.meta.t}</p>}
            {sel.meta.u && (
              <a href={sel.meta.u} target="_blank" rel="noreferrer" className="link mt-2 inline-block font-mono text-xs">open ↗</a>
            )}
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">nearest neighbours</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {sel.near.map((n) => (
                <li key={n.i}>
                  <button className="chip hover:border-ink hover:text-ink" onClick={() => map?.select(n.i)}>{n.name}</button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" onPointerLeave={() => map?.highlight(-1)}>
        {clusters.map((c, i) => (
          <li key={i}>
            <button
              onPointerEnter={() => map?.highlight(i)}
              onClick={() => map?.setCluster(i)}
              aria-pressed={state.cluster === i}
              className={`chip flex items-center gap-1.5 hover:text-ink ${state.cluster === i ? "!border-ink !text-ink" : ""}`}
            >
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
              {c.name}
              <span className="tabular opacity-60">{c.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
