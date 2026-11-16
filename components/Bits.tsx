"use client";

import { useEffect, useRef, useState } from "react";

/** Relative time, filled in on the client so a cached page never lies. */
export function Ago({ at }: { at: string | number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const ms = typeof at === "number" ? at * 1000 : new Date(at).getTime();
    const m = Math.round((Date.now() - ms) / 60000);
    setText(m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`);
  }, [at]);
  return <span suppressHydrationWarning>{text}</span>;
}

type Race = { round: number; name: string; city: string; raceDate: string; raceTime: string; target?: string; pb?: string };

/** Next race on the calendar with a ticking countdown to lights out. */
export function NextRace({ races }: { races: Race[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <div className="h-[92px]" />;
  const start = (r: Race) => new Date(`${r.raceDate}T${r.raceTime}:00Z`).getTime();
  const next = races.find((r) => start(r) + 2 * 3600e3 >= now);
  if (!next)
    return (
      <div>
        <p className="text-2xl font-bold tracking-tight">Season over</p>
        <p className="mt-1 font-mono text-xs text-muted">see you in Melbourne</p>
      </div>
    );
  const d = Math.max(0, start(next) - now);
  const parts = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60, Math.floor(d / 1e3) % 60];
  return (
    <div>
      <p className="text-2xl font-bold leading-none tracking-tight">
        {next.name.replace(" GP", "")} <span className="font-mono text-xs font-normal text-muted">R{next.round} · {next.city}</span>
      </p>
      <p className="mt-3 font-mono text-3xl tabular leading-none tracking-tight">
        {d === 0 ? "lights out" : parts.map((p, i) => (i ? String(p).padStart(2, "0") : p)).join(":")}
      </p>
      <p className="mt-2 font-mono text-[11px] text-muted">
        d:h:m:s to lights out{next.target && <> · sim lap target <span className="text-ink">{next.target}</span></>}
        {next.pb && <> · PB <span className="text-ink">{next.pb}</span></>}
      </p>
    </div>
  );
}

/** Muted loop that only downloads and plays while it is on screen. */
export function LoopVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current!;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" aria-label={label} className="h-full w-full object-cover" />;
}
