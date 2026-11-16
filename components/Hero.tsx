"use client";

import { useEffect, useRef, useState } from "react";
import { Flow, type FlowStats } from "@/lib/flow";

export function Hero({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const flow = useRef<Flow | null>(null);
  const [on, setOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<0 | 1>(0);
  const [stats, setStats] = useState<FlowStats>({ nx: 0, ny: 0, re: 420, mlups: 0 });

  useEffect(() => {
    const f = new Flow(canvas.current!, host.current!, setStats);
    if (!f.init()) return;
    flow.current = f;
    setOn(true);
    setPaused(f.isPaused);
    return () => {
      f.destroy();
      flow.current = null;
      setOn(false);
    };
  }, []);

  return (
    <section id="top" ref={host} className={`hero ${on ? "flow-on" : ""}`}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="wrap hero-grid">
        <h1 className="hero-name">
          <span data-flow-text>Tom</span> <span data-flow-text>Bale</span>
        </h1>

        <div className="hero-card" data-flow-solid>
          {children}
        </div>

        <figcaption className="hero-cap">
          <p>
            <b>Fig. 1.</b> Flow past the author&apos;s name. A D2Q9 lattice Boltzmann solver, the kind
            I spent a term optimising for HPC, running live on your GPU. Stir it with the cursor.
          </p>
          {on && (
            <div className="hero-hud">
              <span className="tabular">
                {stats.nx}×{stats.ny} cells
              </span>
              <span className="tabular">{stats.mlups ? stats.mlups.toFixed(0) : "–"} MLUPS</span>
              <label className="flex items-center gap-2">
                <span className="tabular">Re {stats.re}</span>
                <input
                  type="range"
                  min={60}
                  max={1200}
                  step={20}
                  value={stats.re}
                  onChange={(e) => flow.current?.setRe(+e.target.value)}
                  aria-label="Reynolds number"
                />
              </label>
              <button
                onClick={() => {
                  flow.current?.setPaused(!paused);
                  setPaused(!paused);
                }}
              >
                {paused ? "play" : "pause"}
              </button>
              <button onClick={() => flow.current?.reset()}>reset</button>
              <button
                onClick={() => {
                  const v = view ? 0 : 1;
                  flow.current?.setView(v);
                  setView(v);
                }}
              >
                show {view ? "vorticity" : "speed"}
              </button>
            </div>
          )}
        </figcaption>
      </div>
    </section>
  );
}
