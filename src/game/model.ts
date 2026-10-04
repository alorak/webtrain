export const SIZE = 24;
export const CHUNK_SIZE = SIZE;
export const STORAGE_KEY = "webtrain-world-v1";
export type Heading = 0 | 1 | 2 | 3;
export type Turn = -1 | 0 | 1;
export type ChunkEdge = "x-" | "x+" | "y-" | "y+";
export interface Chunk {
  x: number;
  y: number;
}

export type DecorationKind =
  | "house"
  | "houseBlue"
  | "houseRed"
  | "cottage"
  | "farmhouse"
  | "pine"
  | "tree"
  | "treeSmall"
  | "blossom"
  | "flowers"
  | "duck"
  | "cow"
  | "sheep"
  | "chicken"
  | "pond"
  | "water"
  | "mountain"
  | "mountainSnow"
  | "windmill"
  | "balloon"
  | "ferris"
  | "waterfall"
  | "fountain"
  | "tent"
  | "carousel"
  | "cake"
  | "circus"
  | "icecream"
  | "funhouse"
  | "gift"
  | "playground"
  | "stationSmall"
  | "stationLarge"
  | "stationCountry"
  | "tunnelStone"
  | "tunnelGreen";

export type Tool = "select" | "track" | "erase" | DecorationKind;

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
  chunks: Chunk[];
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
  "houseBlue",
  "houseRed",
  "cottage",
  "farmhouse",
  "pine",
  "tree",
  "treeSmall",
  "blossom",
  "flowers",
  "duck",
  "cow",
  "sheep",
  "chicken",
  "pond",
  "water",
  "mountain",
  "mountainSnow",
  "windmill",
  "balloon",
  "ferris",
  "waterfall",
  "fountain",
  "tent",
  "carousel",
  "cake",
  "circus",
  "icecream",
  "funhouse",
  "gift",
  "playground",
  "stationSmall",
  "stationLarge",
  "stationCountry",
  "tunnelStone",
  "tunnelGreen",
];

export const trackOverlayKinds: DecorationKind[] = [
  "stationSmall",
  "stationLarge",
  "stationCountry",
  "tunnelStone",
  "tunnelGreen",
];

export const isTrackOverlayKind = (kind: DecorationKind) =>
  trackOverlayKinds.includes(kind);

export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const sameChunk = (a: Chunk, b: Chunk) => a.x === b.x && a.y === b.y;
export const chunkForCell = (p: Point): Chunk => ({
  x: Math.floor(p.x / CHUNK_SIZE),
  y: Math.floor(p.y / CHUNK_SIZE),
});
export const inside = (p: Point, world?: Pick<World, "chunks">) => {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
  const chunk = chunkForCell(p);
  const chunks = world?.chunks ?? [{ x: 0, y: 0 }];
  return chunks.some((candidate) => sameChunk(candidate, chunk));
};
export function neighboringChunk(chunk: Chunk, edge: ChunkEdge): Chunk {
  if (edge === "x-") return { x: chunk.x - 1, y: chunk.y };
  if (edge === "x+") return { x: chunk.x + 1, y: chunk.y };
  if (edge === "y-") return { x: chunk.x, y: chunk.y - 1 };
  return { x: chunk.x, y: chunk.y + 1 };
}
export function exposedChunkEdges(world: Pick<World, "chunks">) {
  return world.chunks.flatMap((chunk) =>
    (["x-", "x+", "y-", "y+"] as ChunkEdge[])
      .filter(
        (edge) =>
          !world.chunks.some((other) =>
            sameChunk(other, neighboringChunk(chunk, edge)),
          ),
      )
      .map((edge) => ({ chunk, edge })),
  );
}
export function expandChunk(
  world: World,
  chunk: Chunk,
  edge: ChunkEdge,
): boolean {
  if (!world.chunks.some((candidate) => sameChunk(candidate, chunk))) return false;
  const next = neighboringChunk(chunk, edge);
  if (world.chunks.some((candidate) => sameChunk(candidate, next))) return false;
  world.chunks.push(next);
  return true;
}

export const nextCell = (track: Track): Point => ({
  x: track.x + vectors[track.exit].x,
  y: track.y + vectors[track.exit].y,
});

export function candidate(world: World, turn: Turn): Track | null {
  if (world.closed || !world.tracks.length) return null;
  const last = world.tracks.at(-1)!;
  const cell = nextCell(last);
  if (
    !inside(cell, world) ||
    world.tracks.some((p) => same(p, cell)) ||
    world.decorations.some((p) => same(p, cell))
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
  if (!inside(cell, world) || world.decorations.some((p) => same(p, cell)))
    return false;

  const hasTrack = world.tracks.some((p) => same(p, cell));
  if (isTrackOverlayKind(kind)) {
    if (!hasTrack) return false;
  } else if (hasTrack) {
    return false;
  }

  world.decorations.push({ ...cell, kind });
  return true;
}

export function createWorld(): World {
  const world: World = {
    version: 1,
    chunks: [{ x: 0, y: 0 }],
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
      data.tracks.length + data.decorations.length > SIZE * SIZE * Math.max(2, (Array.isArray(data.chunks) ? data.chunks.length : 1) * 2)
    )
      return null;

    const chunks: Chunk[] = Array.isArray(data.chunks)
      ? data.chunks
      : [{ x: 0, y: 0 }];
    if (
      !chunks.length ||
      chunks.some(
        (chunk) =>
          !chunk ||
          !Number.isInteger(chunk.x) ||
          !Number.isInteger(chunk.y),
      )
    )
      return null;
    const chunkKeys = new Set(chunks.map((chunk) => `${chunk.x},${chunk.y}`));
    if (chunkKeys.size !== chunks.length) return null;
    data.chunks = chunks;

    const trackCells = new Set<string>();
    for (const t of data.tracks) {
      if (!t || !inside(t, data)) return null;
      const key = `${t.x},${t.y}`;
      if (trackCells.has(key)) return null;
      trackCells.add(key);
    }

    const decorationCells = new Set<string>();
    for (const d of data.decorations) {
      if (!d || !inside(d, data) || !kinds.includes(d.kind)) return null;
      const key = `${d.x},${d.y}`;
      if (decorationCells.has(key)) return null;
      decorationCells.add(key);
      const hasTrack = trackCells.has(key);
      if (isTrackOverlayKind(d.kind) ? !hasTrack : hasTrack) return null;
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
