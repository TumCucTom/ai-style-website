"use client";

import { useEffect, useRef, useState } from "react";
import { Flow, type FlowStats } from "@/lib/flow";
import { ContactGate } from "@/components/ContactGate";

/** Each word is its own box, so each word is its own obstacle in the flow. */
function Big({ text, size = "" }: { text: string; size?: "" | "md" | "sm" }) {
  return (
    <p className={`tn-big ${size}`}>
      {text.split(" ").map((w, i) => (
        <span key={i} data-flow-text>
          {w}
        </span>
      ))}
    </p>
  );
}

type Props = {
  top: { name: string; say: string; href?: string; image: string; year?: number }[];
  more: number;
  jobs: { role: string; org: string; dates: string; say: string }[];
  repos: { name: string; href: string; n: number }[];
};

const VIEWS = ["vorticity", "speed", "smoke"] as const;

export function Tunnel({ top, more, jobs, repos }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flow = useRef<Flow | null>(null);
  const [on, setOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<0 | 1 | 2>(2);
  const [stats, setStats] = useState<FlowStats>({ nx: 0, ny: 0, re: 700, mlups: 0 });

  useEffect(() => {
    const f = new Flow(canvas.current!, canvas.current!, setStats, { page: true });
    f.startRe();
    if (!f.init()) return;
    flow.current = f;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __flow: Flow }).__flow = f;
    setOn(true);
    setPaused(f.isPaused);
    return () => {
      f.destroy();
      flow.current = null;
      setOn(false);
    };
  }, []);

  return (
    <div className="tn">
      <canvas ref={canvas} className="tn-canvas" aria-hidden="true" />
      <a className="all-versions" href="/#versions">
        <span aria-hidden="true">←</span> all versions
      </a>

      <section className="tn-screen tn-first l" data-hue="0">
        <h1>
          <Big text="Tom Bale" />
        </h1>
        <div className="tn-card" data-flow-solid>
          <p className="k">Hi, I&apos;m Tom</p>
          <p>I&apos;m a product engineer at Anima, in London.</p>
          <p>
            This page is a wind tunnel. Air comes in at the top, and everything you scroll past is stood in it. It&apos;s
            a lattice Boltzmann solver running on your GPU. I spent a term at uni making one of these go fast, so I&apos;ve
            reused the idea here.
          </p>
          <p>Scroll down. Move your mouse through it.</p>
        </div>
      </section>

      <section className="tn-screen r" data-hue="1">
        <Big text="Anima" size="md" />
        <div className="tn-card" data-flow-solid>
          <p className="k">Now · since June 2026</p>
          <h2>Product engineer at Anima</h2>
          <p>
            I rebuilt one of the four main product lines, from talking to customers through to rollout. I also built a
            loop that lets changes to it get written, shipped and checked without much hand-holding.
          </p>
          <p>I still look after it. I&apos;ve also worked on evaluating voice agents and AI scribing.</p>
        </div>
      </section>

      <section className="tn-screen l" data-hue="2">
        <Big text="Things I made" size="sm" />
        <div className="tn-zig">
          {top.map((p) => (
            <a key={p.name} href={p.href} target="_blank" rel="noreferrer" className="tn-card tn-proj" data-flow-solid>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" loading="lazy" />
              <p className="k">{p.year}</p>
              <h2>
                {p.name} <span aria-hidden="true">↗</span>
              </h2>
              <p>{p.say}</p>
            </a>
          ))}
        </div>
        <div className="tn-card tn-note" data-flow-solid>
          <p>
            There are {more} more on GitHub. Mostly iOS apps and F1 telemetry things.
          </p>
        </div>
      </section>

      <section className="tn-screen r" data-hue="3">
        <Big text="8× H100" size="md" />
        <div className="tn-card" data-flow-solid>
          <p className="k">ISC&apos;25 · Student Cluster Competition</p>
          <h2>The UK team</h2>
          <p>
            In 2025 I was on the UK team at the ISC Student Cluster Competition. We had 208 cores and eight H100s. I
            worked on tuning OpenMX and on fine-tuning Llama 8B.
          </p>
        </div>
      </section>

      <section className="tn-screen l" data-hue="4">
        <Big text="1/211" size="md" />
        <div className="tn-card" data-flow-solid>
          <p className="k">University of Bristol · 2023 to 2026</p>
          <h2>Computer science</h2>
          <p>
            I got a First. I came 1st of 211 in the machine learning and computer systems coursework. My dissertation
            was the VLM memory project above; it got 85% and won Best Computer Vision Project.
          </p>
          <p>I also started the Quantum Computing Society while I was there.</p>
        </div>
      </section>

      <section className="tn-screen r" data-hue="5">
        <Big text="Before that" size="sm" />
        <div className="tn-zig">
          {jobs.map((j) => (
            <div key={j.role + j.org} className="tn-card" data-flow-solid>
              <p className="k">{j.dates}</p>
              <h2>
                {j.role}, {j.org}
              </h2>
              <p>{j.say}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tn-screen l" data-hue="1">
        <Big text="Pull requests" size="sm" />
        <div className="tn-card" data-flow-solid>
          <p className="k">Other people&apos;s code</p>
          <p>I send pull requests to projects I use, now and then. Mostly tests, small fixes and docs.</p>
          <ul>
            {repos.map((r) => (
              <li key={r.name}>
                <a href={r.href} target="_blank" rel="noreferrer">
                  {r.name}
                </a>{" "}
                <span className="n">{r.n}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tn-screen r" data-hue="0">
        <Big text="10:30" size="md" />
        <div className="tn-card" data-flow-solid>
          <p className="k">Ironman Switzerland · 2024</p>
          <h2>Not at a desk</h2>
          <p>
            3.8 km swim, 180 km bike, then a marathon. It took me ten and a half hours, after nine months of training. I
            swam competitively for eleven years, so at least that part was familiar.
          </p>
          <p>
            Right now I&apos;m coming back from an ACL reconstruction. After that the plan is a sub-3 marathon in Athens
            in 2027.
          </p>
        </div>
      </section>

      <section className="tn-screen l tn-last" data-hue="2">
        <Big text="Say hi" />
        <div className="tn-card tn-gate" data-flow-solid>
          <ContactGate bare />
        </div>
        <p className="tn-cue">
          If this one&apos;s a bit much, there are <a href="/#versions">quieter versions</a>.
        </p>
      </section>

      {on && (
        <div className="tn-hud" role="group" aria-label="Simulation">
          <span className="tabular tn-wide" title="lattice cells">
            {stats.nx}×{stats.ny}
          </span>
          <span className="tabular tn-lead" title="million lattice updates per second">
            <b>{stats.mlups ? stats.mlups.toFixed(0) : "–"}</b> MLUPS
          </span>
          <label className="tn-wide">
            <span className="tabular">
              Re <b>{stats.re}</b>
            </span>
            <input type="range" min={100} max={1400} step={20} value={stats.re} onChange={(e) => flow.current?.setRe(+e.target.value)} aria-label="Reynolds number" />
          </label>
          <button
            onClick={() => {
              flow.current?.setPaused(!paused);
              setPaused(!paused);
            }}
            aria-pressed={paused}
          >
            {paused ? "play" : "pause"}
          </button>
          <button
            onClick={() => {
              const v = ((view + 1) % 3) as 0 | 1 | 2;
              flow.current?.setView(v);
              setView(v);
            }}
            title="Change what the colours show"
          >
            <span className="tn-wide" style={{ color: "rgb(var(--muted-rgb))" }}>
              view
            </span>
            {VIEWS[view]}
          </button>
        </div>
      )}
    </div>
  );
}
