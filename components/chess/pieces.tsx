import type { Kind } from "./game";

// Flat, heavy silhouettes on a 100×100 grid. Same shapes for both sides.
export const SHAPES: Record<Kind, React.ReactNode> = {
  p: (
    <>
      <circle cx="50" cy="32" r="14" />
      <path d="M35 80 Q50 34 65 80z" />
      <path d="M26 78h48v11H26z" />
    </>
  ),
  r: (
    <>
      <path d="M28 16h10v9h7v-9h10v9h7v-9h10v22H28z" />
      <path d="M34 38h32l5 40H29z" />
      <path d="M22 78h56v11H22z" />
    </>
  ),
  n: (
    <>
      <path d="M32 78 C32 60 46 54 42 42 L28 50 L22 40 L40 22 L44 10 L52 20 C70 24 76 48 70 78z" />
      <path d="M22 78h56v11H22z" />
    </>
  ),
  b: (
    <>
      <circle cx="50" cy="11" r="5" />
      <path d="M50 14 C64 28 68 42 58 54 H42 C32 42 36 28 50 14z" />
      <path d="M42 54h16l9 24H33z" />
      <path d="M22 78h56v11H22z" />
    </>
  ),
  q: (
    <>
      <path d="M18 30 L33 58 L36 24 L46 56 L50 18 L54 56 L64 24 L67 58 L82 30 L72 78 H28z" />
      <circle cx="18" cy="27" r="5" />
      <circle cx="36" cy="21" r="5" />
      <circle cx="50" cy="15" r="5" />
      <circle cx="64" cy="21" r="5" />
      <circle cx="82" cy="27" r="5" />
      <path d="M22 78h56v11H22z" />
    </>
  ),
  k: (
    <>
      <path d="M45 4h10v9h9v9h-9v12H45V22h-9v-9h9z" />
      <path d="M28 78 C18 52 36 38 50 46 C64 38 82 52 72 78z" />
      <path d="M22 78h56v11H22z" />
    </>
  ),
};

