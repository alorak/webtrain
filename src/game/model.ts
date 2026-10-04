export const SIZE = 24;
export const STORAGE_KEY = "webtrain-world-v1";
export type Heading = 0 | 1 | 2 | 3;
export type Turn = -1 | 0 | 1;
export type DecorationKind =
  | "house"
  | "pine"
  | "tree"
  | "duck"
  | "pond"
  | "windmill"
  | "balloon"
  | "ferris"
  | "waterfall"
  | "tent";
export type Tool = "track" | "erase" | DecorationKind;
export interface Point {
  x: number;
  y: number;
}
export interface Track extends Point {
  entry: Heading;
  exit: Heading;
}
export interface Decoration extends Point {
  kind: DecorationKind;
}
export interface World {
  version: 1;
  tracks: Track[];
  decorations: Decoration[];
  closed: boolean;
}
export const vectors: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
export const kinds: DecorationKind[] = [
  "house",
  "pine",
  "tree",
  "duck",
  "pond",
  "windmill",
  "balloon",
  "ferris",
  "waterfall",
  "tent",
];
export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const inside = (p: Point) =>
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x < SIZE &&
  p.y < SIZE;
export const nextCell = (track: Track): Point => ({
  x: track.x + vectors[track.exit].x,
  y: track.y + vectors[track.exit].y,
});
export function candidate(world: World, turn: Turn): Track | null {
  if (world.closed || !world.tracks.length) return null;
  const last = world.tracks.at(-1)!;
  const cell = nextCell(last);
  if (
    !inside(cell) ||
    [...world.tracks, ...world.decorations].some((p) => same(p, cell))
  )
    return null;
  return {
    ...cell,
    entry: last.exit,
    exit: ((last.exit + turn + 4) % 4) as Heading,
  };
}
export function appendTrack(world: World, turn: Turn): boolean {
  const track = candidate(world, turn);
  if (!track) return false;
  world.tracks.push(track);
  const first = world.tracks[0];
  world.closed = same(nextCell(track), first) && track.exit === first.entry;
  return true;
}
export function placeDecoration(
  world: World,
  cell: Point,
  kind: DecorationKind,
): boolean {
  if (
    !inside(cell) ||
    [...world.tracks, ...world.decorations].some((p) => same(p, cell))
  )
    return false;
  world.decorations.push({ ...cell, kind });
  return true;
}
export function createWorld(): World {
  const world: World = {
    version: 1,
    tracks: [{ x: 5, y: 8, entry: 0, exit: 0 }],
    decorations: [],
    closed: false,
  };
  for (const turn of [0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0] as Turn[])
    appendTrack(world, turn);
  world.decorations = [
    { x: 6, y: 6, kind: "house" },
    { x: 4, y: 6, kind: "pine" },
    { x: 5, y: 5, kind: "pine" },
    { x: 6, y: 13, kind: "house" },
    { x: 8, y: 14, kind: "tree" },
    { x: 10, y: 9, kind: "pond" },
    { x: 12, y: 13, kind: "windmill" },
    { x: 14, y: 6, kind: "balloon" },
    { x: 9, y: 15, kind: "ferris" },
    { x: 3, y: 3, kind: "waterfall" },
    { x: 15, y: 9, kind: "tent" },
    { x: 14, y: 11, kind: "pine" },
    { x: 15, y: 12, kind: "pine" },
    { x: 3, y: 10, kind: "tree" },
    { x: 11, y: 5, kind: "tree" },
    { x: 4, y: 14, kind: "pine" },
  ];
  return world;
}
// Defensive loading: localStorage can contain old, partial or manually edited data.
export function parseWorld(raw: string | null): World | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.tracks) ||
      !Array.isArray(data.decorations) ||
      typeof data.closed !== "boolean" ||
      data.tracks.length < 1 ||
      data.tracks.length + data.decorations.length > SIZE * SIZE
    )
      return null;
    const occupied = new Set<string>();
    for (const p of [...data.tracks, ...data.decorations]) {
      if (!p || !inside(p) || occupied.has(`${p.x},${p.y}`)) return null;
      occupied.add(`${p.x},${p.y}`);
    }
    for (let i = 0; i < data.tracks.length; i++) {
      const t = data.tracks[i];
      if (
        ![0, 1, 2, 3].includes(t.entry) ||
        ![0, 1, 2, 3].includes(t.exit) ||
        (t.entry + 2) % 4 === t.exit
      )
        return null;
      if (
        i &&
        (!same(nextCell(data.tracks[i - 1]), t) ||
          data.tracks[i - 1].exit !== t.entry)
      )
        return null;
    }
    if (data.decorations.some((d: Decoration) => !kinds.includes(d.kind)))
      return null;
    const last = data.tracks.at(-1);
    const first = data.tracks[0];
    if (
      data.closed !== (same(nextCell(last), first) && last.exit === first.entry)
    )
      return null;
    return data as World;
  } catch {
    return null;
  }
}
export const trackLength = (track: Track) =>
  track.entry === track.exit ? 1 : Math.PI / 4;
// Both drawing and train movement use the same true quarter-circle geometry.
export function sampleTrack(
  track: Track,
  t: number,
): { point: Point; tangent: Point } {
  const a = vectors[track.entry],
    b = vectors[track.exit];
  if (track.entry === track.exit)
    return {
      point: { x: track.x + a.x * (t - 0.5), y: track.y + a.y * (t - 0.5) },
      tangent: a,
    };
  const center = { x: (-a.x + b.x) / 2, y: (-a.y + b.y) / 2 };
  const start = Math.atan2(-b.y, -b.x);
  const sign = (track.exit - track.entry + 4) % 4 === 1 ? 1 : -1;
  const angle = start + (sign * t * Math.PI) / 2;
  return {
    point: {
      x: track.x + center.x + Math.cos(angle) / 2,
      y: track.y + center.y + Math.sin(angle) / 2,
    },
    tangent: { x: -Math.sin(angle) * sign, y: Math.cos(angle) * sign },
  };
}
export function sampleRoute(tracks: Track[], distance: number) {
  let remaining = Math.max(0, distance);
  for (const track of tracks) {
    const length = trackLength(track);
    if (remaining <= length) return sampleTrack(track, remaining / length);
    remaining -= length;
  }
  return sampleTrack(tracks.at(-1)!, 1);
}
