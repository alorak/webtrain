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
  | "apartment"
  | "market"
  | "bakery"
  | "cafe"
  | "mosque"
  | "library"
  | "postOffice"
  | "farmhouse"
  | "smallFarm"
  | "fireStation"
  | "policeStation"
  | "hospital"
  | "hospitalCrescent"
  | "school"
  | "cityHall"
  | "pine"
  | "tree"
  | "grove"
  | "pineForest"
  | "autumnTrees"
  | "orchard"
  | "bushes"
  | "rocks"
  | "treeSmall"
  | "blossom"
  | "flowers"
  | "duck"
  | "cow"
  | "sheep"
  | "chicken"
  | "horses"
  | "goats"
  | "deer"
  | "pond"
  | "water"
  | "grassLight"
  | "grassDark"
  | "roadAsphalt"
  | "roadDirt"
  | "roadStone"
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
  // True when the network has no loose ends.
  closed: boolean;
  // Cells whose switch is set to the branch; others take the straight way.
  switches?: string[];
}

export const vectors: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function connectedDecorationEdges(
  world: Pick<World, "decorations">,
  cell: Point,
  kind: DecorationKind,
): boolean[] {
  return vectors.map((vector) =>
    world.decorations.some(
      (decoration) =>
        decoration.kind === kind &&
        decoration.x === cell.x + vector.x &&
        decoration.y === cell.y + vector.y,
    ),
  );
}

// Roads join any neighbouring road, whatever its surface; each side gives
// the neighbour's kind, or null where there is none.
export function roadNeighbours(
  world: Pick<World, "decorations">,
  cell: Point,
): (RoadKind | null)[] {
  return vectors.map((vector) => {
    const road = world.decorations.find(
      (d) =>
        isRoadKind(d.kind) &&
        d.x === cell.x + vector.x &&
        d.y === cell.y + vector.y,
    );
    return road ? (road.kind as RoadKind) : null;
  });
}

// Building doors all face +y (the lower left side on screen). u is the
// door's centre along that face, w half its width and from where the
// building's front ends, all in tile units from the cell centre.
export interface Entrance {
  u: number;
  w: number;
  from: number;
}
export const entranceSide = 1;
const hospitalDoor: Entrance = { u: -0.01, w: 0.09, from: 0.3 };
export const entrances: Partial<Record<DecorationKind, Entrance>> = {
  house: { u: 0.14, w: 0.05, from: 0.26 },
  houseBlue: { u: 0, w: 0.05, from: 0.3 },
  houseRed: { u: 0.205, w: 0.045, from: 0.18 },
  cottage: { u: 0.07, w: 0.04, from: 0.2 },
  apartment: { u: 0, w: 0.06, from: 0.26 },
  farmhouse: { u: -0.02, w: 0.06, from: 0.38 },
  market: { u: 0.19, w: 0.05, from: 0.22 },
  bakery: { u: 0.105, w: 0.045, from: 0.22 },
  cafe: { u: 0.02, w: 0.045, from: 0.16 },
  postOffice: { u: 0, w: 0.06, from: 0.22 },
  library: { u: -0.02, w: 0.09, from: 0.32 },
  fireStation: { u: -0.04, w: 0.29, from: 0.3 },
  policeStation: { u: -0.01, w: 0.09, from: 0.36 },
  hospital: hospitalDoor,
  hospitalCrescent: hospitalDoor,
  school: { u: -0.01, w: 0.06, from: 0.26 },
  mosque: { u: -0.02, w: 0.07, from: 0.2 },
  cityHall: { u: -0.02, w: 0.18, from: 0.46 },
  windmill: { u: 0, w: 0.04, from: 0.2 },
  funhouse: { u: 0, w: 0.07, from: 0.26 },
  icecream: { u: -0.04, w: 0.08, from: 0.2 },
};

// The road in front of a building's door, if there is one.
export function roadAtEntrance(
  world: Pick<World, "decorations">,
  building: Decoration,
): RoadKind | null {
  if (!entrances[building.kind]) return null;
  const v = vectors[entranceSide];
  const road = world.decorations.find(
    (d) => isRoadKind(d.kind) && d.x === building.x + v.x && d.y === building.y + v.y,
  );
  return road ? (road.kind as RoadKind) : null;
}

// Doors that open onto this road tile, per side of the tile.
export function doorsOnRoad(
  world: Pick<World, "decorations">,
  cell: Point,
): (Entrance | null)[] {
  return vectors.map((v, side) => {
    if (side !== (entranceSide + 2) % 4) return null;
    const building = world.decorations.find(
      (d) =>
        !isGroundLayer(d.kind) &&
        entrances[d.kind] &&
        d.x === cell.x + v.x &&
        d.y === cell.y + v.y,
    );
    return building ? entrances[building.kind]! : null;
  });
}

export const kinds: DecorationKind[] = [
  "house",
  "houseBlue",
  "houseRed",
  "cottage",
  "apartment",
  "market",
  "bakery",
  "cafe",
  "mosque",
  "library",
  "postOffice",
  "farmhouse",
  "smallFarm",
  "fireStation",
  "policeStation",
  "hospital",
  "hospitalCrescent",
  "school",
  "cityHall",
  "pine",
  "tree",
  "grove",
  "pineForest",
  "autumnTrees",
  "orchard",
  "bushes",
  "rocks",
  "treeSmall",
  "blossom",
  "flowers",
  "duck",
  "cow",
  "sheep",
  "chicken",
  "horses",
  "goats",
  "deer",
  "pond",
  "water",
  "grassLight",
  "grassDark",
  "roadAsphalt",
  "roadDirt",
  "roadStone",
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

export const grassKinds = ["grassLight", "grassDark"] as const;
export type GrassKind = (typeof grassKinds)[number];
export const isGrassKind = (kind: Tool): kind is GrassKind =>
  (grassKinds as readonly Tool[]).includes(kind);

export const roadKinds = ["roadAsphalt", "roadDirt", "roadStone"] as const;
export type RoadKind = (typeof roadKinds)[number];
export const isRoadKind = (kind: Tool): kind is RoadKind =>
  (roadKinds as readonly Tool[]).includes(kind);

// Grass is ground cover: a cell can hold one patch of it under a track or
// another object, so it lives on its own layer.
export const isGroundLayer = (kind: DecorationKind) => isGrassKind(kind);
const sameLayer = (a: DecorationKind, b: DecorationKind) =>
  isGroundLayer(a) === isGroundLayer(b);

// Tile kinds are painted: the tool stays selected so neighbouring tiles can
// be laid one after another.
export const isTileKind = (kind: Tool) =>
  kind === "water" || isGrassKind(kind) || isRoadKind(kind);

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

// The rails form a small network. A cell holds one piece, or two at a
// switch: a straight piece plus a curve that shares one of its ends.
// Pieces join whenever their ends meet across a cell edge.
export interface RailEnd {
  track: Track;
  side: Heading;
}
export type BranchKind = "forwardLeft" | "forwardRight" | "backLeft" | "backRight";
export const branchKinds: BranchKind[] = ["forwardLeft", "forwardRight", "backLeft", "backRight"];

export const cellKey = (p: Point) => `${p.x},${p.y}`;
export const sidesOf = (t: Track): [Heading, Heading] => [
  ((t.entry + 2) % 4) as Heading,
  t.exit,
];
const step = (p: Point, side: number): Point => ({
  x: p.x + vectors[side].x,
  y: p.y + vectors[side].y,
});
export const piecesAt = (world: Pick<World, "tracks">, cell: Point) =>
  world.tracks.filter((t) => same(t, cell));
export const isSwitch = (world: Pick<World, "tracks">, cell: Point) =>
  piecesAt(world, cell).length === 2;
export const switchThrown = (world: World, cell: Point) =>
  (world.switches ?? []).includes(cellKey(cell));

// Pieces in the neighbouring cell whose end meets this side.
export function linked(world: Pick<World, "tracks">, track: Track, side: number) {
  const cell = step(track, side);
  const back = (side + 2) % 4;
  return world.tracks.filter((t) => same(t, cell) && sidesOf(t).includes(back as Heading));
}

export function openEnds(world: Pick<World, "tracks">): RailEnd[] {
  const seen = new Set<string>();
  const ends: RailEnd[] = [];
  for (const track of world.tracks)
    for (const side of sidesOf(track)) {
      const key = `${cellKey(track)},${side}`;
      if (seen.has(key) || linked(world, track, side).length) continue;
      seen.add(key);
      ends.push({ track, side });
    }
  return ends;
}
const isClosed = (world: Pick<World, "tracks">) => openEnds(world).length === 0;

// The piece a train takes when it reaches a switch from its shared end.
export function activePiece(world: World, cell: Point): Track {
  const pieces = piecesAt(world, cell);
  if (pieces.length < 2) return pieces[0];
  const thrown = switchThrown(world, cell);
  return pieces.find((t) => (t.entry !== t.exit) === thrown) ?? pieces[0];
}

export function extendCandidate(world: World, end: RailEnd, turn: Turn): Track | null {
  if (linked(world, end.track, end.side).length) return null;
  const cell = step(end.track, end.side);
  if (
    !inside(cell, world) ||
    world.tracks.some((p) => same(p, cell)) ||
    world.decorations.some((p) => same(p, cell) && !isGroundLayer(p.kind))
  )
    return null;
  return { ...cell, entry: end.side, exit: ((end.side + turn + 4) % 4) as Heading };
}
export function extendFrom(world: World, end: RailEnd, turn: Turn): Track | null {
  const track = extendCandidate(world, end, turn);
  if (!track) return null;
  world.tracks.push(track);
  world.closed = isClosed(world);
  return track;
}

// The newest piece's far end, used by the starter world and older callers.
const lastEnd = (world: World): RailEnd => {
  const last = world.tracks.at(-1)!;
  return { track: last, side: last.exit };
};
export function candidate(world: World, turn: Turn): Track | null {
  if (!world.tracks.length) return null;
  return extendCandidate(world, lastEnd(world), turn);
}
export function appendTrack(world: World, turn: Turn): boolean {
  return Boolean(world.tracks.length && extendFrom(world, lastEnd(world), turn));
}

// A branch turns a straight piece into a switch. "Forward" follows the
// piece's own direction; left and right are as seen while travelling.
export function branchCandidate(world: World, cell: Point, kind: BranchKind): Track | null {
  const pieces = piecesAt(world, cell);
  if (pieces.length !== 1 || pieces[0].entry !== pieces[0].exit) return null;
  if (world.decorations.some((d) => same(d, cell) && isTrackOverlayKind(d.kind))) return null;
  const heading = kind.startsWith("back") ? (pieces[0].entry + 2) % 4 : pieces[0].entry;
  const exit = (heading + (kind.endsWith("Right") ? 1 : 3)) % 4;
  const next = step(cell, exit);
  if (!inside(next, world)) return null;
  if (world.decorations.some((d) => same(d, next) && !isGroundLayer(d.kind))) return null;
  const there = piecesAt(world, next);
  if (there.length && !there.some((t) => sidesOf(t).includes(((exit + 2) % 4) as Heading)))
    return null;
  return { ...cell, entry: heading as Heading, exit: exit as Heading };
}
export function addBranch(world: World, cell: Point, kind: BranchKind): boolean {
  const track = branchCandidate(world, cell, kind);
  if (!track) return false;
  world.tracks.push(track);
  world.closed = isClosed(world);
  return true;
}

export function toggleSwitch(world: World, cell: Point): boolean {
  if (!isSwitch(world, cell)) return false;
  const key = cellKey(cell);
  const list = world.switches ?? [];
  const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  if (next.length) world.switches = next;
  else delete world.switches;
  return true;
}

// Only loose ends can be removed, so the network always stays in one piece.
export function removableTrack(world: World, cell: Point): Track | null {
  if (world.tracks.length <= 1) return null;
  const pieces = piecesAt(world, cell);
  if (pieces.length === 2) {
    const branch = pieces.find((t) => t.entry !== t.exit)!;
    const other = pieces.find((t) => t !== branch)!;
    const own = sidesOf(branch).find((s) => !sidesOf(other).includes(s))!;
    return linked(world, branch, own).length ? null : branch;
  }
  const [track] = pieces;
  if (!track) return null;
  return sidesOf(track).some((s) => !linked(world, track, s).length) ? track : null;
}
export function removeTrack(world: World, cell: Point): boolean {
  const track = removableTrack(world, cell);
  if (!track) return false;
  world.tracks.splice(world.tracks.indexOf(track), 1);
  const key = cellKey(cell);
  if (world.switches?.includes(key)) {
    world.switches = world.switches.filter((k) => k !== key);
    if (!world.switches.length) delete world.switches;
  }
  if (!piecesAt(world, cell).length)
    world.decorations = world.decorations.filter(
      (d) => !(same(d, cell) && isTrackOverlayKind(d.kind)),
    );
  world.closed = isClosed(world);
  return true;
}

// Checks the shape of a loaded network: valid pieces, proper switches and
// every piece reachable from the first one.
function validNetwork(world: World): boolean {
  const cells = new Map<string, Track[]>();
  for (const t of world.tracks) {
    if (
      !t ||
      !inside(t, world) ||
      ![0, 1, 2, 3].includes(t.entry) ||
      ![0, 1, 2, 3].includes(t.exit) ||
      (t.entry + 2) % 4 === t.exit
    )
      return false;
    const key = cellKey(t);
    cells.set(key, [...(cells.get(key) ?? []), t]);
  }
  for (const pieces of cells.values()) {
    if (pieces.length > 2) return false;
    if (pieces.length === 2) {
      const [a, b] = pieces;
      const shared = sidesOf(a).filter((s) => sidesOf(b).includes(s));
      if (shared.length !== 1 || (a.entry === a.exit) === (b.entry === b.exit)) return false;
    }
  }
  const reached = new Set<Track>([world.tracks[0]]);
  const queue = [world.tracks[0]];
  while (queue.length) {
    const t = queue.pop()!;
    const next = [
      ...piecesAt(world, t),
      ...sidesOf(t).flatMap((s) => linked(world, t, s)),
    ];
    for (const n of next)
      if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
  }
  if (reached.size !== world.tracks.length) return false;
  if (world.switches !== undefined) {
    if (!Array.isArray(world.switches) || !world.switches.length) return false;
    if (new Set(world.switches).size !== world.switches.length) return false;
    if (world.switches.some((k) => typeof k !== "string" || cells.get(k)?.length !== 2))
      return false;
  }
  return world.closed === isClosed(world);
}

// A train is a position on one piece: t runs along the stored direction and
// forward says whether it travels that way.
export interface TrainState {
  track: number;
  forward: boolean;
  t: number;
}
const exitSide = (track: Track, forward: boolean) =>
  forward ? track.exit : (((track.entry + 2) % 4) as Heading);

// The next piece past an end: switches decide when the train meets their
// shared end; prefer lets a trailing wagon follow the train's own path.
function nextPiece(world: World, track: Track, side: Heading, prefer: Track[] = []) {
  const options = linked(world, track, side);
  if (options.length < 2) return options[0];
  return options.find((t) => prefer.includes(t)) ?? activePiece(world, step(track, side));
}

// Moves a train along the network. At a dead end it turns around unless
// stopAtEnd is set, in which case null means it ran out of rail.
export function advanceTrain(
  world: World,
  state: TrainState,
  distance: number,
  { stopAtEnd = false, prefer = [] as Track[], onEnter }: {
    stopAtEnd?: boolean;
    prefer?: Track[];
    onEnter?: (from: Track) => void;
  } = {},
): TrainState | null {
  let { track: index, forward } = state;
  let track = world.tracks[index];
  let u = (forward ? state.t : 1 - state.t) + distance / trackLength(track);
  for (let guard = 0; guard < 64; guard++) {
    const side = exitSide(track, forward);
    const next = nextPiece(world, track, side, prefer);
    const limit = next || stopAtEnd ? 1 : 1 - 0.12 / trackLength(track);
    if (u <= limit) break;
    const overflow = (u - limit) * trackLength(track);
    if (!next) {
      if (stopAtEnd) return null;
      forward = !forward;
      u = 1 - limit + overflow / trackLength(track);
      continue;
    }
    onEnter?.(track);
    const entering = (side + 2) % 4;
    forward = (next.entry + 2) % 4 === entering;
    track = next;
    index = world.tracks.indexOf(next);
    u = overflow / trackLength(track);
  }
  return { track: index, forward, t: forward ? u : 1 - u };
}

export function trainPose(world: World, state: TrainState) {
  const { point, tangent } = sampleTrack(world.tracks[state.track], state.t);
  const sign = state.forward ? 1 : -1;
  return { point, tangent: { x: tangent.x * sign, y: tangent.y * sign } };
}

export function placeDecoration(
  world: World,
  cell: Point,
  kind: DecorationKind,
): boolean {
  if (
    !inside(cell, world) ||
    world.decorations.some((p) => same(p, cell) && sameLayer(p.kind, kind))
  )
    return false;
  if (isGroundLayer(kind)) {
    world.decorations.push({ ...cell, kind });
    return true;
  }

  const pieces = world.tracks.filter((p) => same(p, cell)).length;
  if (isTrackOverlayKind(kind)) {
    // Stations and tunnels need a plain piece of rail, not a switch.
    if (pieces !== 1) return false;
  } else if (pieces) {
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

    if (!validNetwork(data as World)) return null;
    const trackCells = new Map<string, number>();
    for (const t of data.tracks)
      trackCells.set(`${t.x},${t.y}`, (trackCells.get(`${t.x},${t.y}`) ?? 0) + 1);

    const decorationCells = new Set<string>();
    for (const d of data.decorations) {
      if (!d || !inside(d, data) || !kinds.includes(d.kind)) return null;
      const cell = `${d.x},${d.y}`;
      const key = `${cell},${isGroundLayer(d.kind) ? "ground" : "object"}`;
      if (decorationCells.has(key)) return null;
      decorationCells.add(key);
      if (isGroundLayer(d.kind)) continue;
      const pieces = trackCells.get(cell) ?? 0;
      if (isTrackOverlayKind(d.kind) ? pieces !== 1 : pieces > 0) return null;
    }

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
