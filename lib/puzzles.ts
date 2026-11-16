import puzzlesData from "@/data/puzzles.json";

export type PuzzleKind =
  | "quantum"
  | "combinatorics"
  | "number-theory"
  | "sequence"
  | "geometry"
  | "modular"
  | "algorithm"
  | "probability"
  | "hpc"
  | "chess"
  | "cube"
  | "optimisation"
  | "game-theory";

export type Puzzle = {
  kind: PuzzleKind;
  title: string;
  prompt: string;
  hint?: string;
  answer: string | string[];
  normalize?: "strip" | "num";
  difficulty: 1 | 2 | 3;
};

export const PUZZLES: Puzzle[] = puzzlesData as Puzzle[];

export const PUZZLE_BLURB: Record<PuzzleKind, string> = {
  quantum: "A small quantum circuit, computed by hand.",
  combinatorics: "A counting problem — mind the repeats and symmetries.",
  "number-theory": "An arithmetic or factoring puzzle.",
  sequence: "Find the next term in a non-standard sequence.",
  geometry: "A spatial counting problem.",
  modular: "Compute a number mod something — usually a power of 10.",
  algorithm: "A classic algorithm complexity or move-count.",
  probability: "An expected value or a probability, worked out exactly.",
  hpc: "Parallel computing arithmetic — speedups, scaling and limits.",
  chess: "A problem on a chessboard, not always a flat one.",
  cube: "Rubik's cube group theory.",
  optimisation: "Find the best strategy and report what it achieves.",
  "game-theory": "A two-player game with perfect play on both sides.",
};

export function isCorrect(p: Puzzle, input: string): boolean {
  const norm = p.normalize === "num" ? num : strip;
  const v = norm(input);
  const accepted = Array.isArray(p.answer) ? p.answer : [p.answer];
  // Normalise the accepted answers too, so entries in the JSON can be written
  // naturally ("2/3", "0.5") rather than pre-normalised.
  return accepted.some((a) => norm(a) === v);
}

const strip = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// First integer in the input. Thousands separators inside a number
// ("10,080", "10 080") are dropped first so they don't truncate it.
const num = (s: string) => {
  const m = s.replace(/(\d)[,\u00a0\u202f ](?=\d{3}(?!\d))/g, "$1").match(/-?\d+/);
  return m ? m[0] : s.trim();
};
