import type { Metadata } from "next";
import chess from "@/data/live-chess.json";
import projects from "@/data/projects.json";
import { ChessGame } from "@/components/chess/ChessGame";
import "./chess.css";

export const metadata: Metadata = { title: "Tom Bale · a career in 17 moves" };

type Cat = { rating: number | null; best: number | null } | null;

export default function Page() {
  const c = chess as unknown as { user: string; profileUrl: string; rapid: Cat; blitz: Cat; bullet: Cat };
  const ratings = (["rapid", "blitz", "bullet"] as const)
    .map((k) => ({ name: k, rating: c[k]?.rating ?? null, best: c[k]?.best ?? null }))
    .filter((r) => r.rating);
  const find = (slug: string) => {
    const p = projects.find((p) => p.slug === slug);
    const links = p?.links as { live?: string; github?: string } | undefined;
    return p && (links?.live ?? links?.github) ? { name: p.name, tagline: p.tagline, href: (links!.live ?? links!.github)! } : null;
  };
  const builds = [
    find("ai-chess-3d"),
    find("rubix-chess"),
    // not in projects.json yet; public repo with a live site
    { name: "Hidden Chess", tagline: "Chess960 or set-up chess, with the piece types hidden from your opponent.", href: "https://hidden-chess.thomasbale.com" },
  ].filter((b): b is { name: string; tagline: string; href: string } => !!b);

  return <ChessGame user={c.user} profileUrl={c.profileUrl} ratings={ratings} builds={builds} />;
}
