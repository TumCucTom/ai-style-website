import live from "@/data/live.json";
import commits from "@/data/live-commits.json";
import f1 from "@/data/f1.json";
import chess from "@/data/live-chess.json";
import spotify from "@/data/live-spotify.json";
import { Ago, NextRace } from "@/components/Bits";
import { Section } from "@/components/Section";

type Cat = { rating: number | null; best: number | null; wins: number; losses: number; draws: number } | null;

function Rating({ name, c }: { name: string; c: Cat }) {
  if (!c?.rating) return null;
  const total = c.wins + c.losses + c.draws || 1;
  return (
    <div>
      <p className="caps">{name}</p>
      <p className="mt-1.5 font-sans text-3xl font-extrabold leading-none tracking-tight tabular">{c.rating}</p>
      <p className="mono mt-1 text-muted tabular">peak {c.best}</p>
      <div className="mt-2 flex h-[3px] bg-line" title={`${c.wins} won, ${c.draws} drawn, ${c.losses} lost`}>
        <i className="bg-ink" style={{ width: `${(c.wins / total) * 100}%` }} />
        <i className="bg-muted/50" style={{ width: `${(c.draws / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function Live() {
  const c = commits as unknown as {
    fetchedAt: string;
    refreshError?: boolean;
    capped?: boolean;
    summary: { last24h: { commits: number }; last7d: { commits: number } };
  };
  const ch = chess as unknown as { profileUrl: string; user: string; rapid: Cat; blitz: Cat; bullet: Cat };
  const sp = spotify as unknown as {
    current: { name: string; artist: string; album: string; url: string; image: string | null; isNowPlaying: boolean } | null;
    topArtists: { name: string }[];
  };
  const tiles = live.tiles as { kind: string; label: string; value: string; meta?: string }[];
  const letter = (i: number) => String.fromCharCode(97 + i);

  return (
    <Section
      id="now"
      n="§1"
      title="Right now"
      kicker={
        <>
          <span className="live-dot mr-2" />A scheduled job pulls this from GitHub, chess.com and Last.fm every two hours,
          commits the JSON and redeploys. The rest I change by hand.
        </>
      }
    >
      <figure className="rise">
        <div className="cells grid-cols-2 md:grid-cols-4">
          {(
            [
              ["last 24 hours", c.summary.last24h.commits],
              ["last 7 days", c.summary.last7d.commits],
            ] as const
          ).map(([label, n], i) => (
            <div key={label}>
              <p className="caps">({letter(i)}) commits · {label}</p>
              <p className="big mt-4 tabular">
                <span className="count" style={{ "--to": n } as React.CSSProperties} aria-label={String(n)} />
                {c.capped && "+"}
              </p>
            </div>
          ))}

          <div className="col-span-2">
            <p className="caps">(c) formula 1 · next race</p>
            <div className="mt-4">
              <NextRace races={f1.races} />
            </div>
          </div>

          <a href={ch.profileUrl} target="_blank" rel="noreferrer" className="col-span-2">
            <p className="caps">(d) chess.com · {ch.user} ↗</p>
            <div className="mt-4 grid grid-cols-3 gap-5">
              <Rating name="rapid" c={ch.rapid} />
              <Rating name="blitz" c={ch.blitz} />
              <Rating name="bullet" c={ch.bullet} />
            </div>
          </a>

          {sp.current && (
            <a href={sp.current.url} target="_blank" rel="noreferrer" className="col-span-2 flex gap-4">
              {sp.current.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sp.current.image} alt="" width={84} height={84} loading="lazy" className="h-[84px] w-[84px] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="caps">(e) {sp.current.isNowPlaying ? "listening now" : "last played"} ↗</p>
                <p className="mt-2 truncate font-sans text-xl font-bold tracking-tight">{sp.current.name}</p>
                <p className="truncate text-sm text-muted">
                  {sp.current.artist} · <i>{sp.current.album}</i>
                </p>
                {sp.topArtists.length > 0 && (
                  <p className="mono mt-1.5 truncate text-muted">this week: {sp.topArtists.map((a) => a.name).join(", ")}</p>
                )}
              </div>
            </a>
          )}

          {tiles.map((t, i) => (
            <div key={i}>
              <p className="caps">({letter(i + 5)}) {t.label}</p>
              <p className="mt-2.5 font-sans font-bold leading-snug tracking-tight">{t.value}</p>
              {t.meta && <p className="mono mt-1.5 text-muted">{t.meta}</p>}
            </div>
          ))}
        </div>
        <figcaption>
          <b>Fig. 2.</b> Telemetry. (a, b) Rolling windows of unique commits I authored, or that shipped in pull requests I
          opened or merged; private work counts toward totals only and this site&apos;s own refreshes are excluded. Snapshot
          from <Ago at={c.fetchedAt} />
          {c.refreshError && ", the last refresh that succeeded"}. (c) Lap targets are mine, for sim racing.
        </figcaption>
      </figure>
    </Section>
  );
}
