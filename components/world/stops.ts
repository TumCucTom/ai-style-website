export type Stop = {
  id: string;
  place: string;
  when: string;
  lat: number;
  lon: number;
  /** camera distance from the globe's centre, in globe radii */
  alt: number;
  kicker: string;
  lines: string[];
  stat?: { k: string; v: string }[];
};

export type Race = {
  round: number;
  name: string;
  circuit: string;
  city: string;
  raceDate: string;
  raceTime: string;
  target?: string;
  pb?: string;
};

/**
 * What is real in each walk-around place, shown as a small credit while you
 * are in it. Bristol, Monaco and MIT are laid out from map and height data;
 * the rest are made up.
 */
export const CREDITS: Record<string, string> = {
  bristol: "Ground, streets and building outlines are real: © OpenStreetMap contributors, EU-DEM heights. I built the bridge by hand.",
  monaco: "Ground, streets and building outlines are real: © OpenStreetMap contributors, EU-DEM heights. The barriers, kerbs and cars are mine.",
  mit: "Buildings, paths and trees are where the map says: © OpenStreetMap contributors, USGS heights. I built the portico and dome by hand. Boston is made up.",
  essex: "Made up. It is neither school.",
  ironman: "Made up. A Swiss-looking valley, since my notes only say Switzerland.",
  london: "Made up. It isn't the office, or London.",
  isc: "Made up. Not the real hall.",
};

/** Stops with a place you can walk around (see places.ts). */
export const WALKABLE = new Set(["essex", "bristol", "ironman", "mit", "isc", "london", "monaco"]);

export const STOPS: Stop[] = [
  {
    id: "essex",
    place: "Essex",
    when: "2018 – 2023",
    lat: 51.87,
    lon: 0.66,
    alt: 1.36,
    kicker: "School",
    lines: [
      "Felsted first, then Colchester Royal Grammar for A-levels.",
      "My A-level project was a chess engine for an 8×8×8 board. It got 75 out of 75.",
    ],
    stat: [
      { k: "A-levels", v: "A*A*AA" },
      { k: "3D chess", v: "75 / 75" },
    ],
  },
  {
    id: "bristol",
    place: "Bristol",
    when: "2023 – 2026",
    lat: 51.458,
    lon: -2.603,
    alt: 1.36,
    kicker: "University",
    lines: [
      "Three years of computer science. Came out with a First.",
      "I started the quantum computing society and wrote my dissertation on giving vision-language models a memory.",
    ],
    stat: [
      { k: "degree", v: "First" },
      { k: "dissertation", v: "85%" },
    ],
  },
  {
    id: "ironman",
    place: "Switzerland",
    when: "2024",
    lat: 46.75,
    lon: 7.63,
    alt: 1.5,
    kicker: "Did an Ironman once",
    lines: ["3.8 km swim, 180 km on the bike, then a marathon. It took 10h30 and about nine months of training."],
    stat: [
      { k: "distance", v: "226 km" },
      { k: "time", v: "10h30" },
    ],
  },
  {
    id: "mit",
    place: "MIT",
    when: "2025 – 2026",
    lat: 42.36,
    lon: -71.094,
    alt: 1.75,
    kicker: "iQuHACK",
    lines: [
      "MIT's quantum hackathon. I led a Bristol team there and coached two more.",
      "In 2025 we picked up an IonQ bounty, which is what got me to start the society. In 2026 we were first after day one of IonQ's entanglement challenge.",
    ],
  },
  {
    id: "oxford",
    place: "Oxford",
    when: "2025",
    lat: 51.752,
    lon: -1.258,
    alt: 1.36,
    kicker: "ETH Oxford",
    lines: [
      "A hackathon. Our team won the DeFi track with a quantum approach to cross-chain arbitrage, and came second in the Vyper bounty.",
    ],
    stat: [{ k: "prize", v: "$5,000" }],
  },
  {
    id: "isc",
    place: "ISC'25",
    when: "2025",
    lat: 53.56,
    lon: 9.99,
    alt: 1.5,
    kicker: "Student Cluster Competition, Hamburg",
    lines: [
      "I was on the UK team. We got a 208-core cluster with eight H100s and spent the time tuning OpenMX and fine-tuning Llama.",
    ],
    stat: [
      { k: "cores", v: "208" },
      { k: "GPUs", v: "8 × H100" },
    ],
  },
  {
    id: "london",
    place: "London",
    when: "2026 – now",
    lat: 51.507,
    lon: -0.128,
    alt: 1.36,
    kicker: "Anima",
    lines: [
      "Where I work now, as a product engineer.",
      "I rebuilt one of the four main product lines, and set up a loop that ships software changes without much hand-holding.",
    ],
  },
  {
    id: "monaco",
    place: "Monaco",
    when: "sim racing",
    lat: 43.7347,
    lon: 7.4206,
    alt: 1.5,
    kicker: "I haven't actually been",
    lines: ["Sim racing. F1 25, Monaco, 1:11.96 so far. Trying to get it down to 1:09."],
    stat: [
      { k: "best lap", v: "1:11.96" },
      { k: "target", v: "1:09.0" },
    ],
  },
];

/** Where each Grand Prix on the calendar is, keyed by the city in data/f1.json. */
const CIRCUITS: Record<string, [number, number]> = {
  Melbourne: [-37.85, 144.97],
  Shanghai: [31.34, 121.22],
  Suzuka: [34.84, 136.54],
  Miami: [25.96, -80.24],
  "Montréal": [45.5, -73.52],
  Monaco: [43.73, 7.42],
  "Montmeló": [41.57, 2.26],
  Spielberg: [47.22, 14.76],
  Silverstone: [52.07, -1.02],
  Stavelot: [50.44, 5.97],
  "Mogyoród": [47.58, 19.25],
  Zandvoort: [52.39, 4.54],
  Monza: [45.62, 9.28],
  Baku: [40.37, 49.85],
  Singapore: [1.29, 103.86],
  Austin: [30.13, -97.64],
  "Mexico City": [19.4, -99.09],
  "São Paulo": [-23.7, -46.7],
  "Las Vegas": [36.11, -115.17],
  Lusail: [25.49, 51.45],
  "Abu Dhabi": [24.47, 54.6],
};

/** The last stop is wherever the paddock is heading next. */
export function nextRaceStop(races: Race[], now: number): Stop | null {
  const start = (r: Race) => new Date(`${r.raceDate}T${r.raceTime}:00Z`).getTime();
  const next = races.find((r) => start(r) + 2 * 3600e3 >= now);
  if (!next || !CIRCUITS[next.city]) return null;
  const [lat, lon] = CIRCUITS[next.city];
  const days = Math.max(0, Math.ceil((start(next) - now) / 864e5));
  const date = new Date(start(next)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return {
    id: "next-race",
    place: next.city,
    when: date,
    lat,
    lon,
    alt: 1.9,
    kicker: `Next race: round ${next.round}, ${next.name}`,
    lines: [`${next.circuit}, ${date}. The last stop moves to wherever the next F1 race is.`],
    stat: [
      { k: "starts in", v: days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}` },
      ...(next.target ? [{ k: "my sim target", v: next.target }] : []),
    ],
  };
}

export function coords(s: Stop) {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
  return `${f(s.lat, "N", "S")} ${f(s.lon, "E", "W")}`;
}

/** Great-circle distance in km. */
export function km(a: Stop, b: Stop) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
