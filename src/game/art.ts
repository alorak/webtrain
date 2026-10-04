import Phaser from "phaser";
import {
  CHUNK_SIZE,
  isGrassKind,
  isRoadKind,
  isTrackOverlayKind,
  sampleTrack,
  type Chunk,
  entrances,
  vectors,
  type DecorationKind,
  type Entrance,
  type PenLinks,
  type Point,
  type GrassKind,
  type RoadKind,
  type Track,
} from "./model";
type G = Phaser.GameObjects.Graphics;
export const project = (p: Point) => ({
  x: (p.x - p.y) * 48,
  y: (p.x + p.y) * 24,
});
export const unproject = (p: Point) => ({
  x: Math.round(p.x / 96 + p.y / 48),
  y: Math.round(p.y / 48 - p.x / 96),
});
function poly(g: G, color: number, coords: number[], alpha = 1) {
  g.fillStyle(color, alpha).fillPoints(
    Array.from({ length: coords.length / 2 }, (_, i) => ({
      x: coords[i * 2],
      y: coords[i * 2 + 1],
    })),
    true,
  );
}
function ellipse(
  g: G,
  c: number,
  x: number,
  y: number,
  w: number,
  h: number,
  a = 1,
) {
  g.fillStyle(c, a).fillEllipse(x, y, w, h);
}
function line(
  g: G,
  c: number,
  w: number,
  x: number,
  y: number,
  x2: number,
  y2: number,
) {
  g.lineStyle(w, c).lineBetween(x, y, x2, y2);
}
export function diamond(g: G, color: number, alpha = 1) {
  poly(g, color, [0, -24, 48, 0, 0, 24, -48, 0], alpha);
}

export function waterTile(g: G, connected: boolean[]) {
  const top = { x: 0, y: -24 };
  const right = { x: 48, y: 0 };
  const bottom = { x: 0, y: 24 };
  const left = { x: -48, y: 0 };

  poly(g, 0x67b9c7, [0, -24, 48, 0, 0, 24, -48, 0]);
  poly(g, 0x85ced2, [0, -18, 36, 0, 0, 18, -36, 0], 0.72);
  g.lineStyle(2, 0xc8e4cf, 0.9);
  const edges = [
    [right, bottom],
    [bottom, left],
    [left, top],
    [top, right],
  ] as const;
  edges.forEach(([a, b], heading) => {
    if (!connected[heading]) g.lineBetween(a.x, a.y, b.x, b.y);
  });
  g.lineStyle(1.5, 0xdaf3ee, 0.65).lineBetween(-18, -2, -3, -2);
  g.lineStyle(1.5, 0xdaf3ee, 0.5).lineBetween(8, 7, 25, 7);
}

const roadStyles: Record<RoadKind, { surface: number; edge: number; light: number; dark: number }> = {
  roadAsphalt: { surface: 0x7f8b88, edge: 0x5c6764, light: 0xa3adaa, dark: 0x6b7774 },
  roadDirt: { surface: 0xb57d46, edge: 0x8a5a31, light: 0xd09e64, dark: 0x9a6637 },
  roadStone: { surface: 0x9d907a, edge: 0x77695a, light: 0xe3d8bf, dark: 0xcdbfa2 },
};

type Rect = [x0: number, x1: number, y0: number, y1: number];
type Segment = [x0: number, y0: number, x1: number, y1: number];
// Lays road surface over the given rectangles, with texture on a fixed 8×8
// grid per tile (so it lines up across tiles) and the given edge lines.
function paveRoad(g: G, kind: RoadKind, pieces: Rect[], edges: Segment[], seams: Segment[] = []) {
  const style = roadStyles[kind];
  for (const [x0, x1, y0, y1] of pieces) pad(g, x0, x1, y0, y1, style.surface);
  const step = 0.125;
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const u = -0.5 + (i + 0.5) * step;
      const v = -0.5 + (j + 0.5) * step;
      if (!pieces.some(([x0, x1, y0, y1]) => u > x0 && u < x1 && v > y0 && v < y1))
        continue;
      const hash = (i * 37 + j * 91 + i * j * 7) % 11;
      if (kind === "roadStone") {
        const a = step * 0.4;
        pad(g, u - a, u + a, v - a, v + a, hash % 3 ? style.dark : style.light);
      } else if (hash % (kind === "roadAsphalt" ? 4 : 3) === 0) {
        const [x, y] = iso([u + (hash % 5) * 0.012, v - (hash % 3) * 0.015, 0]);
        ellipse(g, hash % 2 ? style.light : style.dark, x, y, 4 + (hash % 3), 2.5, 0.75);
      }
    }
  for (const [x0, y0, x1, y1] of edges) trim(g, style.edge, 1.6, [x0, y0, 0], [x1, y1, 0]);
  for (const [x0, y0, x1, y1] of seams)
    g.lineStyle(1.2, style.edge, 0.55).lineBetween(...iso([x0, y0, 0]), ...iso([x1, y1, 0]));
}

export function roadTile(
  g: G,
  kind: RoadKind,
  neighbours: (RoadKind | null | false)[],
  doors: (Entrance | null)[] = [],
) {
  // Tile based like water: the road sits inset from the grass and grows a
  // full-width arm to every edge shared with another road, so neighbours
  // merge into one continuous strip. A change of surface gets a thin seam,
  // and a narrower arm reaches out to the door of a building next to it.
  const h = 0.375;
  const pieces: Rect[] = [[-h, h, -h, h]];
  const edges: Segment[] = [];
  const seams: Segment[] = [];
  vectors.forEach((v, heading) => {
    // Work along this side: "a" runs along the edge, "n" points outwards.
    const at = (a: number, n: number): [number, number] =>
      v.x ? [n * v.x, a] : [a, n * v.y];
    const rect = (a0: number, a1: number): Rect => {
      const [x0, y0] = at(a0, h);
      const [x1, y1] = at(a1, 0.5);
      return [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
    };
    const side = (a: number) => [...at(a, h), ...at(a, 0.5)] as Segment;
    const along = (a0: number, a1: number, n = h) => [...at(a0, n), ...at(a1, n)] as Segment;
    const door = doors[heading];
    if (neighbours[heading]) {
      pieces.push(rect(-h, h));
      edges.push(side(-h), side(h));
      if (neighbours[heading] !== kind) seams.push(along(-h, h, 0.5));
    } else if (door) {
      const a0 = Math.max(-h, door.u - door.w);
      const a1 = Math.min(h, door.u + door.w);
      pieces.push(rect(a0, a1));
      edges.push(along(-h, a0), along(a1, h), side(a0), side(a1));
    } else edges.push(along(-h, h));
  });
  paveRoad(g, kind, pieces, edges, seams);
}

// The building's end of a road that leads to its door.
function doorWalk(g: G, kind: RoadKind, { u, w, from }: Entrance) {
  paveRoad(g, kind, [[u - w, u + w, from, 0.5]], [
    [u - w, from, u - w, 0.5],
    [u + w, from, u + w, 0.5],
  ]);
}

export function grassTile(g: G, kind: GrassKind, connected: boolean[]) {
  // Full-tile ground cover; open edges get a soft rim so patches read as shapes.
  const [fill, tuft, rim] =
    kind === "grassLight" ? [0xc4dd98, 0xa3c87a, 0xb3d287] : [0x8eb972, 0x739f5b, 0x7fab64];
  poly(g, fill, [0, -24, 48, 0, 0, 24, -48, 0]);
  const corners = [
    { x: 48, y: 0 },
    { x: 0, y: 24 },
    { x: -48, y: 0 },
    { x: 0, y: -24 },
  ];
  corners.forEach((a, heading) => {
    const b = corners[(heading + 3) % 4];
    if (connected[heading]) g.lineStyle(1, 0xd5e6b7, 0.24);
    else g.lineStyle(2, rim, 0.9);
    g.lineBetween(a.x, a.y, b.x, b.y);
  });
  for (const [x, y] of [[-20, -3], [-4, 9], [8, -9], [22, 3], [-8, -12]]) {
    line(g, tuft, 1.5, x, y, x - 2, y - 4);
    line(g, tuft, 1.5, x, y, x + 3, y - 3);
  }
}

export function ground(g: G, chunks: Chunk[]) {
  g.clear();
  for (const chunk of chunks) {
    const startX = chunk.x * CHUNK_SIZE;
    const startY = chunk.y * CHUNK_SIZE;
    for (let localY = 0; localY < CHUNK_SIZE; localY += 1)
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const x = startX + localX;
        const y = startY + localY;
        const p = project({ x, y });
        g.save().translateCanvas(p.x, p.y);
        diamond(g, (x + y) % 2 ? 0xaacb85 : 0xaece89);
        g.lineStyle(1, 0xd5e6b7, 0.24).strokePoints(
          [
            { x: 0, y: -24 },
            { x: 48, y: 0 },
            { x: 0, y: 24 },
            { x: -48, y: 0 },
          ],
          true,
        );
        if ((Math.abs(x * 7 + y * 13) % 11) === 0) {
          line(g, 0x8fb570, 1.5, 14, 1, 12, -3);
          line(g, 0x8fb570, 1.5, 14, 1, 17, -2);
        }
        if ((Math.abs(x * 13 + y * 7) % 37) === 0) {
          ellipse(g, 0xf8edb5, -12, 3, 3, 2);
          ellipse(g, 0xffffff, -8, 6, 3, 2);
        }
        g.restore();
      }
  }
}
export function drawTrack(g: G, track: Track, alpha = 1) {
  const points = Array.from({ length: 25 }, (_, i) =>
    sampleTrack(track, i / 24),
  );
  const edge = (offset: number) =>
    points.map(({ point: p, tangent: v }) =>
      project({ x: p.x - v.y * offset, y: p.y + v.x * offset }),
    );
  g.fillStyle(0x657949, 0.14 * alpha).fillPoints(
    [...edge(0.29), ...edge(-0.29).reverse()],
    true,
  );
  g.fillStyle(0xe5d5a9, alpha).fillPoints(
    [...edge(0.25), ...edge(-0.25).reverse()],
    true,
  );
  for (let i = 1; i < 24; i += 3) {
    const { point: p, tangent: v } = points[i];
    const a = project({ x: p.x - v.y * 0.2, y: p.y + v.x * 0.2 });
    const b = project({ x: p.x + v.y * 0.2, y: p.y - v.x * 0.2 });
    g.lineStyle(5, 0x82664d, alpha).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1, 0xb29368, alpha).lineBetween(a.x, a.y - 1, b.x, b.y - 1);
  }
  for (const offset of [-0.135, 0.135]) {
    const rail = edge(offset);
    g.lineStyle(4, 0x505c53, alpha).strokePoints(rail, false);
    g.lineStyle(1.6, 0xe2e5cb, alpha).strokePoints(
      rail.map((p) => ({ x: p.x, y: p.y - 1.3 })),
      false,
    );
  }
}
// Buildings are drawn as little boxes: x/y in tile units from the cell centre,
// z in pixels. The +y face (screen left) is lit, the +x face (screen right) is in shade.
type V3 = [number, number, number];
type Box = [x0: number, x1: number, y0: number, y1: number, z0: number, z1: number];
const iso = ([x, y, z]: V3): [number, number] => [(x - y) * 48, (x + y) * 24 - z];
function face(g: G, color: number, ...corners: V3[]) {
  poly(g, color, corners.flatMap(iso));
}
function trim(g: G, color: number, width: number, ...corners: V3[]) {
  g.lineStyle(width, color).strokePoints(
    corners.map((c) => {
      const [x, y] = iso(c);
      return { x, y };
    }),
    false,
  );
}
function shadow(g: G, [x0, x1, y0, y1]: Box) {
  poly(
    g,
    0x47694b,
    [[x0, y0], [x1 + 0.1, y0], [x1 + 0.1, y1 + 0.05], [x0, y1 + 0.05]].flatMap(
      ([x, y]) => iso([x, y, 0]),
    ),
    0.16,
  );
}
function pad(g: G, x0: number, x1: number, y0: number, y1: number, color: number) {
  face(g, color, [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]);
}
function block(g: G, [x0, x1, y0, y1, z0, z1]: Box, left: number, right: number, top?: number) {
  face(g, left, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
  face(g, right, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  if (top !== undefined)
    face(g, top, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
}
// A flat roof with a low parapet rim.
function flatRoof(g: G, [x0, x1, y0, y1, , z]: Box, inset: number) {
  const d = 0.035;
  face(g, inset, [x0 + d, y0 + d, z], [x1 - d, y0 + d, z], [x1 - d, y1 - d, z], [x0 + d, y1 - d, z]);
}
// A quad lying on the lit face (y = at) or the shaded face (x = at); u runs along that face.
function pane(
  g: G,
  side: "l" | "r",
  at: number,
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  color: number,
) {
  const p = (u: number, z: number): V3 => (side === "l" ? [u, at, z] : [at, u, z]);
  face(g, color, p(u0, z0), p(u1, z0), p(u1, z1), p(u0, z1));
}
function win(g: G, side: "l" | "r", at: number, u0: number, u1: number, z0: number, z1: number) {
  pane(g, side, at, u0 - 0.015, u1 + 0.015, z0 - 1.5, z1 + 1.5, 0xfff5dd);
  pane(g, side, at, u0, u1, z0, z1, side === "l" ? 0x8ab9c4 : 0x739fab);
}
function door(g: G, side: "l" | "r", at: number, u0: number, u1: number, h: number, color = 0x7b5c49) {
  pane(g, side, at, u0 - 0.012, u1 + 0.012, 0, h + 1.5, 0xfff5dd);
  pane(g, side, at, u0, u1, 0, h, color);
}
// Pitched roof on a box; `behind` draws things (a chimney) between the far and near slopes.
function gable(
  g: G,
  [x0, x1, y0, y1, , z]: Box,
  h: number,
  along: "x" | "y",
  roof: number,
  shade: number,
  end: number,
  behind?: () => void,
) {
  const e = 0.05;
  if (along === "x") {
    const m = (y0 + y1) / 2;
    face(g, shade, [x0 - e, y0 - e, z], [x1 + e, y0 - e, z], [x1 + e, m, z + h], [x0 - e, m, z + h]);
    behind?.();
    face(g, end, [x1, y0, z], [x1, y1, z], [x1, m, z + h]);
    face(g, roof, [x0 - e, y1 + e, z], [x1 + e, y1 + e, z], [x1 + e, m, z + h], [x0 - e, m, z + h]);
    trim(g, 0xfff3d8, 1.5, [x1 + e, y0 - e, z], [x1 + e, m, z + h], [x1 + e, y1 + e, z]);
  } else {
    const m = (x0 + x1) / 2;
    face(g, roof, [x0 - e, y0 - e, z], [x0 - e, y1 + e, z], [m, y1 + e, z + h], [m, y0 - e, z + h]);
    behind?.();
    face(g, end, [x0, y1, z], [x1, y1, z], [m, y1, z + h]);
    face(g, shade, [x1 + e, y0 - e, z], [x1 + e, y1 + e, z], [m, y1 + e, z + h], [m, y0 - e, z + h]);
    trim(g, 0xfff3d8, 1.5, [x0 - e, y1 + e, z], [m, y1 + e, z + h], [x1 + e, y1 + e, z]);
  }
}
function pyramid(g: G, [x0, x1, y0, y1, , z]: Box, h: number, light: number, shade: number) {
  const e = 0.02;
  const apex: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, z + h];
  face(g, shade, [x1 + e, y0 - e, z], [x1 + e, y1 + e, z], apex);
  face(g, light, [x0 - e, y1 + e, z], [x1 + e, y1 + e, z], apex);
}
function flag(g: G, x: number, y: number, h: number, color: number, z = 0) {
  const [px, py] = iso([x, y, z]);
  line(g, 0x8c8577, 1.5, px, py, px, py - h);
  poly(g, color, [px, py - h, px + 12, py - h + 3, px, py - h + 7]);
}
const brick = [0xc98f6e, 0xa8735a, 0x8c5f4b] as const;

// Screen-space helpers for round props, centred on cx/cy; angles 0..π are the front.
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 8) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  }).flat();
function cylinder(g: G, cx: number, cy: number, rx: number, ry: number, h: number, side: number, top: number) {
  poly(g, side, [...arc(cx, cy, rx, ry, 0, Math.PI), ...arc(cx, cy - h, rx, ry, Math.PI, 0)]);
  ellipse(g, top, cx, cy - h, rx * 2, ry * 2);
}
function stripes(g: G, cx: number, cy: number, rx: number, ry: number, h: number, colors: number[], n: number) {
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI * i) / n;
    const a1 = (Math.PI * (i + 1)) / n;
    poly(g, colors[i % colors.length], [...arc(cx, cy, rx, ry, a0, a1, 3), ...arc(cx, cy - h, rx, ry, a1, a0, 3)]);
  }
}
function cone(g: G, cx: number, cy: number, rx: number, ry: number, h: number, colors: number[], n: number) {
  ellipse(g, colors[colors.length - 1], cx, cy, rx * 2, ry * 2);
  for (let i = 0; i < n; i++)
    poly(g, colors[i % colors.length], [
      cx,
      cy - h,
      ...arc(cx, cy, rx, ry, (Math.PI * i) / n, (Math.PI * (i + 1)) / n, 3),
    ]);
}
function scallops(g: G, cx: number, cy: number, rx: number, ry: number, colors: number[], n: number) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    ellipse(g, colors[i % colors.length], cx + rx * Math.cos(a), cy + ry * Math.sin(a), 4 + (Math.PI * rx * Math.sin(a)) / n, 7);
  }
}
const blob = (g: G, w: number, h: number) => ellipse(g, 0x47694b, 4, 4, w, h, 0.16);
// A point in the upright plane y = at, offset from (u0, z0) by r pixels at angle a.
function onPlane(at: number, u0: number, z0: number, a: number, r: number): [number, number] {
  const [x, y] = iso([u0, at, z0]);
  return [x + r * Math.cos(a) * 0.894, y + r * Math.cos(a) * 0.447 - r * Math.sin(a)];
}
function fence(g: G, points: [number, number][]) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    for (const z of [4, 9]) trim(g, 0xc99a66, 1.6, [ax, ay, z], [bx, by, z]);
  }
  for (const [x, y] of points) line(g, 0x9b7048, 2.5, ...iso([x, y, 0]), ...iso([x, y, 12]));
}
function hospital(g: G, emblem: "cross" | "crescent") {
  const b: Box = [-0.34, 0.3, -0.3, 0.3, 0, 40];
  shadow(g, b);
  block(g, b, 0xf7f4ec, 0xdcd7ca, 0xd2d9d7);
  flatRoof(g, b, 0xc3cbc9);
  pane(g, "l", 0.3, -0.34, 0.3, 35, 37, 0xd9574e);
  pane(g, "r", 0.3, -0.3, 0.3, 35, 37, 0xb94539);
  for (const [a, c] of [[-0.29, -0.2], [0.14, 0.23]]) win(g, "l", 0.3, a, c, 8, 15);
  for (const [a, c] of [[-0.29, -0.2], [-0.14, -0.05], [0, 0.09], [0.14, 0.23]])
    win(g, "l", 0.3, a, c, 23, 30);
  for (const z of [8, 23])
    for (const [a, c] of [[-0.22, -0.12], [-0.04, 0.06], [0.14, 0.24]])
      win(g, "r", 0.3, a, c, z, z + 7);
  door(g, "l", 0.3, -0.08, 0.06, 16, 0x8fc3c4);
  trim(g, 0xfff5dd, 1.2, [-0.01, 0.3, 0], [-0.01, 0.3, 16]);
  block(g, [-0.12, 0.1, 0.3, 0.39, 17, 20], 0xf7f4ec, 0xdcd7ca, 0xffffff);
  pane(g, "l", 0.06, -0.2, 0.08, 40, 57, 0xfffdf6);
  if (emblem === "cross") {
    pane(g, "l", 0.06, -0.14, 0.02, 46.5, 50.5, 0xd9574e);
    pane(g, "l", 0.06, -0.1, -0.02, 42, 55, 0xd9574e);
  } else {
    const [x, y] = iso([-0.06, 0.06, 48.5]);
    ellipse(g, 0xd9574e, x - 1, y, 12, 12);
    ellipse(g, 0xfffdf6, x + 2.5, y - 1, 10, 10);
  }
}
function horse(g: G, x: number, y: number, color: number) {
  line(g, color, 1.5, x - 4, y + 2, x - 6, y + 7);
  line(g, color, 1.5, x + 4, y + 2, x + 6, y + 7);
  ellipse(g, color, x, y, 14, 7);
  line(g, color, 3, x + 4, y - 1, x + 7, y - 6);
  ellipse(g, color, x + 8, y - 7, 7, 5);
  ellipse(g, 0xd9574e, x - 1, y - 3, 6, 3);
  line(g, 0x8c6b52, 1.5, x - 7, y - 1, x - 10, y + 3);
}

// Fenced animal pens share one footprint; the far fence is drawn behind the animals.
const alone: PenLinks = { sides: [false, false, false, false], corners: [false, false, false, false] };
// A pen is a fenced square in the middle of its tile. Next to another pen it
// reaches to the shared edge with no fence between them, like the roads, and
// its outer fences line up with the neighbour's. Far fences are drawn behind
// the animals, near ones in front.
function pen(g: G, ground: number, inside: () => void, { sides, corners }: PenLinks = alone) {
  const h = 0.3;
  const rects: Rect[] = [[-h, h, -h, h]];
  const fences: Segment[] = [];
  vectors.forEach((v, k) => {
    const at = (a: number, n: number): [number, number] => (v.x ? [n * v.x, a] : [a, n * v.y]);
    if (!sides[k]) {
      fences.push([...at(-h, h), ...at(h, h)]);
      return;
    }
    const [x0, y0] = at(-h, h);
    const [x1, y1] = at(h, 0.5);
    rects.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]);
    // Each side of the arm, unless a filled corner continues the pen there.
    for (const a of [-h, h]) {
      const lateral = v.x ? { x: 0, y: Math.sign(a) } : { x: Math.sign(a), y: 0 };
      const j = vectors.findIndex((w) => w.x === lateral.x && w.y === lateral.y);
      const filled = j === (k + 1) % 4 ? corners[k] : corners[j];
      if (!filled) fences.push([...at(a, h), ...at(a, 0.5)]);
    }
  });
  corners.forEach((filled, k) => {
    if (!filled) return;
    const q = { x: vectors[k].x + vectors[(k + 1) % 4].x, y: vectors[k].y + vectors[(k + 1) % 4].y };
    rects.push([q.x > 0 ? h : -0.5, q.x > 0 ? 0.5 : -h, q.y > 0 ? h : -0.5, q.y > 0 ? 0.5 : -h]);
  });
  for (const [x0, x1, y0, y1] of rects) pad(g, x0, x1, y0, y1, ground);
  const post = (segment: Segment): [number, number][] => {
    const [x0, y0, x1, y1] = segment;
    const points: [number, number][] = [[x0, y0], [x1, y1]];
    if (Math.hypot(x1 - x0, y1 - y0) > 0.45) points.splice(1, 0, [(x0 + x1) / 2, (y0 + y1) / 2]);
    return points;
  };
  const far = (s: Segment) => s[0] + s[1] + s[2] + s[3] < 0;
  for (const segment of fences.filter(far)) fence(g, post(segment));
  inside();
  for (const segment of fences.filter((s) => !far(s))) fence(g, post(segment));
}
function cow(g: G, x: number, y: number) {
  for (const dx of [-5, -2, 3, 5]) line(g, 0x5e5046, 1.4, x + dx, y - 4, x + dx, y);
  ellipse(g, 0xf4efe3, x, y - 6, 16, 9);
  ellipse(g, 0x5c5149, x - 3, y - 7, 5, 4);
  ellipse(g, 0x5c5149, x + 2, y - 5, 4, 3);
  ellipse(g, 0xf6f0e4, x + 8, y - 9, 6, 6);
  ellipse(g, 0xe9b7a5, x + 10, y - 8, 3.5, 3);
  line(g, 0xb99a6d, 1, x + 7, y - 12, x + 6, y - 14);
  line(g, 0xb99a6d, 1, x + 10, y - 12, x + 11, y - 14);
}
function sheep(g: G, x: number, y: number) {
  for (const dx of [-3, 3]) line(g, 0x554e49, 1.4, x + dx, y - 3, x + dx, y);
  ellipse(g, 0xf4f0dd, x, y - 5, 12, 8);
  ellipse(g, 0xffffff, x - 2, y - 7, 7, 6);
  ellipse(g, 0xffffff, x + 2, y - 8, 6, 5);
  ellipse(g, 0x554e49, x + 6, y - 7, 4.5, 4.5);
}
function chicken(g: G, x: number, y: number, color: number) {
  ellipse(g, color, x, y - 3, 6, 5);
  ellipse(g, color, x + 2.5, y - 6, 3.5, 3.5);
  poly(g, 0xe2a13f, [x + 4, y - 6.5, x + 6, y - 6, x + 4, y - 5.5]);
  ellipse(g, 0xd75c55, x + 2.5, y - 8, 2, 1.6);
}
function duckling(g: G, x: number, y: number, color: number) {
  ellipse(g, color, x, y - 2, 7, 4.5);
  ellipse(g, color, x + 3, y - 5, 3.5, 3.5);
  poly(g, 0xe4ad53, [x + 4.5, y - 5.5, x + 7, y - 5, x + 4.5, y - 4.5]);
}
const at = (u: number, v: number) => iso([u, v, 0]);

// Small trees, rocks and animals drawn at a screen point; s scales the whole figure.
function leafy(
  g: G,
  x: number,
  y: number,
  s: number,
  leaves = [0x619863, 0x80b076, 0x92bc7d, 0x72a469],
) {
  ellipse(g, 0x47694b, x + 3 * s, y + 1, 30 * s, 10 * s, 0.16);
  line(g, 0x856750, 4 * s, x, y, x, y - 24 * s);
  ellipse(g, leaves[0], x, y - 30 * s, 34 * s, 31 * s);
  ellipse(g, leaves[1], x - 9 * s, y - 33 * s, 20 * s, 20 * s);
  ellipse(g, leaves[2], x + 1 * s, y - 41 * s, 20 * s, 17 * s);
  ellipse(g, leaves[3], x + 11 * s, y - 29 * s, 16 * s, 20 * s);
}
function conifer(g: G, x: number, y: number, s: number) {
  ellipse(g, 0x47694b, x + 3 * s, y + 1, 26 * s, 9 * s, 0.16);
  g.fillStyle(0x86634e).fillRect(x - 2 * s, y - 10 * s, 4 * s, 11 * s);
  for (const [dy, w] of [[-8, 15], [-18, 12], [-27, 9]]) {
    const b = y + dy * s;
    poly(g, 0x39806a, [x - w * s, b, x, b - 24 * s, x + w * s, b]);
    poly(g, 0x266852, [x, b - 24 * s, x + w * s, b, x, b + 2 * s]);
    poly(g, 0x68a47a, [x - w * s, b, x, b - 24 * s, x - 3 * s, b - 4 * s]);
  }
}
function rock(g: G, x: number, y: number, s: number) {
  poly(g, 0x9a988a, [x - 10 * s, y, x - 7 * s, y - 8 * s, x - 1 * s, y - 12 * s, x + 8 * s, y - 8 * s, x + 11 * s, y, x + 2 * s, y + 3 * s]);
  poly(g, 0x7d7b70, [x + 2 * s, y + 3 * s, x - 1 * s, y - 12 * s, x + 8 * s, y - 8 * s, x + 11 * s, y]);
  poly(g, 0xb9b7a8, [x - 7 * s, y - 8 * s, x - 1 * s, y - 12 * s, x - 2 * s, y - 5 * s]);
}
function bush(g: G, x: number, y: number, s: number, berries?: number) {
  ellipse(g, 0x47694b, x + 2 * s, y + 1, 20 * s, 7 * s, 0.16);
  ellipse(g, 0x5f9562, x, y - 5 * s, 20 * s, 13 * s);
  ellipse(g, 0x7aac6c, x - 4 * s, y - 8 * s, 11 * s, 9 * s);
  ellipse(g, 0x6aa063, x + 5 * s, y - 7 * s, 10 * s, 9 * s);
  if (berries !== undefined)
    for (const [dx, dy] of [[-5, -6], [2, -9], [6, -4], [-1, -3]])
      ellipse(g, berries, x + dx * s, y + dy * s, 2.5 * s, 2.5 * s);
}
function pony(g: G, x: number, y: number, color: number, mane: number) {
  for (const dx of [-5, -2, 4, 6]) line(g, color, 1.6, x + dx, y - 6, x + dx, y);
  ellipse(g, color, x, y - 8, 16, 8);
  line(g, color, 3.5, x + 6, y - 10, x + 9, y - 16);
  ellipse(g, color, x + 10, y - 17, 7, 4.5);
  line(g, mane, 2, x + 5, y - 11, x + 8, y - 17);
  line(g, mane, 2, x - 8, y - 9, x - 10, y - 3);
}
function goat(g: G, x: number, y: number, color: number) {
  for (const dx of [-3, -1, 2, 4]) line(g, 0x6b5a4c, 1.2, x + dx, y - 4, x + dx, y);
  ellipse(g, color, x, y - 6, 11, 6);
  ellipse(g, color, x + 6, y - 9, 4.5, 4);
  line(g, 0x8c7a62, 1.2, x + 5, y - 11, x + 3, y - 14);
  line(g, 0x8c7a62, 1, x + 7, y - 7, x + 7, y - 5);
}
function deer(g: G, x: number, y: number, antlers: boolean) {
  for (const dx of [-4, -2, 3, 5]) line(g, 0x8a6142, 1.2, x + dx, y - 6, x + dx, y);
  ellipse(g, 0xb98656, x, y - 8, 13, 6);
  line(g, 0xb98656, 2.5, x + 5, y - 9, x + 7, y - 14);
  ellipse(g, 0xb98656, x + 8, y - 15, 5, 3.5);
  ellipse(g, 0xfff6e2, x - 6, y - 9, 2.5, 2.5);
  if (antlers) {
    line(g, 0x8a6142, 1, x + 7, y - 16, x + 5, y - 21);
    line(g, 0x8a6142, 1, x + 9, y - 16, x + 11, y - 21);
    line(g, 0x8a6142, 1, x + 5, y - 19, x + 3, y - 20);
    line(g, 0x8a6142, 1, x + 11, y - 19, x + 13, y - 20);
  }
}
// Draws figures back to front by their depth in the tile.
function cluster(g: G, items: [u: number, v: number, draw: (x: number, y: number) => void][]) {
  for (const [u, v, draw] of [...items].sort((a, b) => a[0] + a[1] - b[0] - b[1]))
    draw(...at(u, v));
}
function peak(g: G, h: number, cap: number) {
  const P = [-6, -h];
  const Q = [17, -h * 0.64];
  poly(g, 0x76847a, [-40, 0, 0, -20, 40, 0, ...Q, ...P]);
  poly(g, 0x8a9785, [-40, 0, 0, 20, ...P]);
  poly(g, 0x66746c, [0, 20, 40, 0, ...Q, ...P]);
  poly(g, 0x5c6a62, [0, 20, 40, 0, ...Q]);
  const snow = ([x, y]: number[], d: number) => [
    x, y, x + 0.6 * d, y + d, x + 0.25 * d, y + 0.75 * d, x, y + 1.05 * d,
    x - 0.35 * d, y + 0.8 * d, x - 0.6 * d, y + d,
  ];
  poly(g, 0xf4f0dc, snow(P, cap));
  if (cap > 18) poly(g, 0xe8e4d2, snow(Q, cap * 0.45));
  poly(g, 0x8aa477, [-40, 0, -30, -8, -19, -3, -8, -11, 4, -2, 18, -9, 31, -3, 40, 0, 0, 20]);
  for (const [x, y] of [[-26, 4], [-14, 10], [24, 5]]) conifer(g, x, y, 0.32);
}
function archWin(g: G, side: "l" | "r", at: number, u0: number, u1: number, z0: number, z1: number) {
  win(g, side, at, u0, u1, z0, z1);
  const [x, y] = iso(side === "l" ? [(u0 + u1) / 2, at, z1] : [at, (u0 + u1) / 2, z1]);
  ellipse(g, 0xfff5dd, x, y, (u1 - u0) * 54 + 3, 6);
  ellipse(g, side === "l" ? 0x8ab9c4 : 0x739fab, x, y + 0.5, (u1 - u0) * 54, 4);
}
function awning(g: G, y: number, x0: number, x1: number, z: number, colors: number[]) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.07));
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n;
    const b = x0 + ((x1 - x0) * (i + 1)) / n;
    face(g, colors[i % colors.length], [a, y, z], [b, y, z], [b, y + 0.11, z - 5], [a, y + 0.11, z - 5]);
  }
}
function crescent(g: G, x: number, y: number, r: number, color: number) {
  poly(g, color, [
    ...arc(x, y, r, r, -0.35, Math.PI + 0.35, 10),
    ...arc(x, y - r * 0.4, r * 0.78, r * 0.78, Math.PI + 0.5, -0.5, 10),
  ]);
}
const modelScale: Partial<Record<DecorationKind, number>> = {
  carousel: 0.75,
  cake: 0.75,
  playground: 0.78,
  gift: 0.85,
};

// Hand-modelled props, drawn around the cell centre with their own shadows.
// Extra facts about a model's surroundings, for drawing it in the world.
export interface ModelContext {
  road?: RoadKind | null;
  pen?: PenLinks;
}
const models: Partial<Record<DecorationKind, (g: G, context: ModelContext) => void>> = {
  house(g) {
    const b: Box = [-0.3, 0.3, -0.26, 0.26, 0, 28];
    shadow(g, b);
    block(g, b, 0xf6ead0, 0xdcc8a4);
    win(g, "l", 0.26, -0.22, -0.1, 11, 21);
    door(g, "l", 0.26, 0.08, 0.2, 18);
    win(g, "r", 0.3, -0.18, -0.06, 11, 21);
    win(g, "r", 0.3, 0.06, 0.18, 11, 21);
    gable(g, b, 24, "x", 0xd0705c, 0xa9554a, 0xdcc8a4, () =>
      block(g, [-0.2, -0.1, -0.14, -0.05, 40, 62], ...brick),
    );
    win(g, "r", 0.3, -0.04, 0.04, 32, 39);
    ellipse(g, 0x6f9d68, ...iso([-0.04, 0.33, 4]), 16, 10);
    ellipse(g, 0xf0c869, ...iso([-0.06, 0.33, 7]), 3, 3);
  },
  houseBlue(g) {
    const b: Box = [-0.28, 0.28, -0.3, 0.3, 0, 26];
    shadow(g, b);
    block(g, b, 0xf6ead0, 0xdcc8a4);
    win(g, "l", 0.3, -0.22, -0.12, 9, 18);
    win(g, "l", 0.3, 0.12, 0.22, 9, 18);
    door(g, "l", 0.3, -0.05, 0.05, 17, 0x6a8fa8);
    win(g, "r", 0.28, -0.2, -0.08, 9, 18);
    win(g, "r", 0.28, 0.08, 0.2, 9, 18);
    gable(g, b, 22, "y", 0x77a8c8, 0x5487aa, 0xf6ead0);
    win(g, "l", 0.3, -0.04, 0.04, 30, 37);
  },
  houseRed(g) {
    const main: Box = [-0.32, 0.06, -0.3, 0.3, 0, 30];
    const wing: Box = [0.06, 0.34, -0.2, 0.18, 0, 20];
    shadow(g, [-0.32, 0.34, -0.3, 0.3, 0, 0]);
    block(g, main, 0xf3dfc0, 0xd9c0a0);
    win(g, "l", 0.3, -0.27, -0.18, 10, 20);
    win(g, "l", 0.3, -0.09, 0, 10, 20);
    gable(g, main, 24, "y", 0xc66a5f, 0xa14f46, 0xf3dfc0);
    win(g, "l", 0.3, -0.17, -0.09, 35, 42);
    block(g, wing, 0xf3dfc0, 0xd9c0a0);
    door(g, "l", 0.18, 0.16, 0.25, 15);
    win(g, "r", 0.34, -0.08, 0.06, 7, 14);
    gable(g, wing, 16, "x", 0xc66a5f, 0xa14f46, 0xd9c0a0);
  },
  cottage(g) {
    const b: Box = [-0.22, 0.22, -0.2, 0.2, 0, 20];
    shadow(g, b);
    block(g, b, 0xefe2c6, 0xd2c0a0);
    door(g, "l", 0.2, 0.03, 0.11, 14, 0x8a6a4f);
    win(g, "l", 0.2, -0.15, -0.05, 7, 14);
    win(g, "r", 0.22, -0.06, 0.06, 7, 14);
    gable(g, b, 22, "x", 0x9a7d5f, 0x76604a, 0xd2c0a0, () =>
      block(g, [-0.12, -0.04, -0.12, -0.04, 30, 48], 0xb1aa9a, 0x948d7e, 0x7e786b),
    );
    win(g, "r", 0.22, -0.035, 0.035, 23, 29);
    for (const [x, y, z] of [[0.3, 0.02, 3], [0.3, 0.1, 3], [0.3, 0.06, 8]] as V3[]) {
      ellipse(g, 0xa77a50, ...iso([x, y, z]), 9, 6);
      ellipse(g, 0xe0bc8a, ...iso([x + 0.02, y + 0.02, z]), 4, 4);
    }
  },
  farmhouse(g) {
    const b: Box = [-0.36, 0.3, -0.26, 0.22, 0, 26];
    shadow(g, [-0.36, 0.3, -0.26, 0.36, 0, 0]);
    block(g, b, 0xf2dfb8, 0xd5bd92);
    door(g, "l", 0.22, -0.07, 0.03, 15);
    win(g, "l", 0.22, -0.26, -0.15, 8, 16);
    win(g, "l", 0.22, 0.1, 0.2, 8, 16);
    win(g, "r", 0.3, -0.16, -0.04, 9, 18);
    win(g, "r", 0.3, 0.06, 0.16, 9, 18);
    gable(g, b, 22, "x", 0xb4594e, 0x8c443c, 0xd5bd92, () =>
      block(g, [0.12, 0.2, -0.12, -0.04, 39, 58], ...brick),
    );
    win(g, "r", 0.3, -0.06, 0.02, 30, 37);
    // Front porch.
    block(g, [-0.32, 0.26, 0.22, 0.36, 0, 3], 0xc89a68, 0xa97d52, 0xd9b27e);
    for (const x of [-0.3, -0.12, 0.08, 0.24])
      line(g, 0xb98955, 2.5, ...iso([x, 0.34, 3]), ...iso([x, 0.34, 17]));
    face(g, 0x9c4e45, [-0.34, 0.38, 16], [0.28, 0.38, 16], [0.28, 0.38, 14], [-0.34, 0.38, 14]);
    face(g, 0x8c443c, [0.28, 0.22, 22], [0.28, 0.38, 16], [0.28, 0.38, 14], [0.28, 0.22, 20]);
    face(g, 0xc0675b, [-0.34, 0.22, 22], [0.28, 0.22, 22], [0.28, 0.38, 16], [-0.34, 0.38, 16]);
    const [hx, hy] = iso([0.42, -0.1, 0]);
    ellipse(g, 0xd9b45f, hx, hy - 5, 17, 12);
    ellipse(g, 0xeccf7e, hx - 2, hy - 7, 10, 8);
  },
  fireStation(g) {
    const b: Box = [-0.36, 0.3, -0.3, 0.3, 0, 32];
    shadow(g, b);
    block(g, b, 0xd2604f, 0xab4a40, 0xe0d2b6);
    flatRoof(g, b, 0xc9bb9e);
    pane(g, "l", 0.3, -0.36, 0.3, 26, 28.5, 0xfff2d4);
    pane(g, "r", 0.3, -0.3, 0.3, 26, 28.5, 0xe7d6b5);
    for (const [a, c] of [[-0.31, -0.07], [0.0, 0.24]]) {
      pane(g, "l", 0.3, a - 0.012, c + 0.012, 0, 21.5, 0xfff2d4);
      pane(g, "l", 0.3, a, c, 0, 20, 0xf3ead6);
      for (const z of [5, 10, 15]) trim(g, 0xd4c6aa, 1.2, [a, 0.3, z], [c, 0.3, z]);
    }
    ellipse(g, 0xf3cf6a, ...iso([-0.035, 0.3, 23.5]), 7, 7);
    win(g, "r", 0.3, -0.22, -0.1, 11, 21);
    win(g, "r", 0.3, 0.04, 0.16, 11, 21);
    const tower: Box = [-0.3, -0.12, -0.26, -0.08, 32, 56];
    block(g, tower, 0xd2604f, 0xab4a40);
    pane(g, "l", -0.08, -0.25, -0.17, 42, 51, 0x5d4a43);
    ellipse(g, 0xf3cf6a, ...iso([-0.21, -0.08, 45.5]), 5, 6);
    pyramid(g, tower, 16, 0x9d4d45, 0x7f3d37);
    ellipse(g, 0xf2a35e, ...iso([-0.21, -0.17, 73]), 4, 4);
    block(g, [0.34, 0.39, 0.22, 0.27, 0, 8], 0xd9574e, 0xb04237, 0xe57b6f);
  },
  policeStation(g) {
    const b: Box = [-0.34, 0.3, -0.3, 0.3, 0, 30];
    shadow(g, b);
    block(g, b, 0xeee9dc, 0xcfc8b6, 0xbfc6c8);
    flatRoof(g, b, 0xaeb6b9);
    pane(g, "l", 0.3, -0.34, 0.3, 22, 27, 0x4f74a0);
    pane(g, "r", 0.3, -0.3, 0.3, 22, 27, 0x3f5f86);
    win(g, "l", 0.3, -0.28, -0.17, 8, 17);
    win(g, "l", 0.3, 0.13, 0.24, 8, 17);
    win(g, "r", 0.3, -0.22, -0.1, 8, 17);
    win(g, "r", 0.3, 0.04, 0.16, 8, 17);
    door(g, "l", 0.3, -0.07, 0.05, 18, 0x3f5f86);
    pane(g, "l", 0.3, -0.05, 0.03, 8, 15, 0x8ab9c4);
    block(g, [-0.1, 0.08, 0.3, 0.36, 0, 3], 0xd6d1c3, 0xb8b2a3, 0xe2ddd0);
    const [bx, by] = iso([-0.01, 0.3, 24.5]);
    ellipse(g, 0xf3cf6a, bx, by, 9, 9);
    ellipse(g, 0x4f74a0, bx, by, 4, 4);
    block(g, [-0.08, 0.04, -0.06, 0.04, 30, 34], 0x5d6b78, 0x4a5662, 0x6f7d8a);
    ellipse(g, 0x5b8fd6, ...iso([-0.06, 0.01, 37]), 5, 5);
    ellipse(g, 0xe0574e, ...iso([0.03, -0.03, 37]), 5, 5);
    flag(g, -0.4, 0.36, 46, 0x4f74a0);
  },
  hospital: (g) => hospital(g, "cross"),
  school(g) {
    const b: Box = [-0.38, 0.3, -0.26, 0.26, 0, 26];
    shadow(g, b);
    block(g, b, 0xf3d796, 0xd8b673);
    for (const [a, c] of [[-0.33, -0.25], [-0.2, -0.12], [0.1, 0.18], [0.21, 0.27]])
      win(g, "l", 0.26, a, c, 9, 19);
    door(g, "l", 0.26, -0.07, 0.05, 17, 0x5f8577);
    trim(g, 0xfff5dd, 1.2, [-0.01, 0.26, 0], [-0.01, 0.26, 17]);
    win(g, "r", 0.3, -0.18, -0.06, 9, 19);
    win(g, "r", 0.3, 0.06, 0.18, 9, 19);
    gable(g, b, 20, "x", 0xc8665a, 0x9e4c43, 0xd8b673);
    const [cx, cy] = iso([0.3, 0, 33]);
    ellipse(g, 0xfffaf0, cx, cy, 8, 9);
    line(g, 0x5d4a43, 1.2, cx, cy, cx, cy - 3);
    line(g, 0x5d4a43, 1.2, cx, cy, cx + 2, cy + 1);
    const cupola: Box = [-0.06, 0.04, -0.05, 0.05, 43, 55];
    block(g, cupola, 0xfff6e2, 0xe2d6bd);
    pane(g, "l", 0.05, -0.04, 0.02, 46, 53, 0x5d4a43);
    ellipse(g, 0xf3cf6a, ...iso([-0.01, 0.05, 48.5]), 4, 5);
    pyramid(g, cupola, 9, 0xc8665a, 0x9e4c43);
    flag(g, -0.46, 0.3, 44, 0xd9574e);
  },
  cityHall(g) {
    const b: Box = [-0.36, 0.3, -0.3, 0.3, 0, 30];
    shadow(g, b);
    block(g, b, 0xf1e3c4, 0xd4c09b, 0xe5d6b5);
    flatRoof(g, b, 0xd8c8a6);
    pane(g, "l", 0.3, -0.36, 0.3, 27, 30, 0xfff4dc);
    pane(g, "r", 0.3, -0.3, 0.3, 27, 30, 0xe2d0ab);
    win(g, "l", 0.3, -0.33, -0.25, 9, 21);
    win(g, "l", 0.3, 0.2, 0.27, 9, 21);
    for (const [a, c] of [[-0.24, -0.14], [-0.06, 0.04], [0.12, 0.22]])
      win(g, "r", 0.3, a, c, 9, 21);
    door(g, "l", 0.3, -0.07, 0.03, 17);
    const tower: Box = [-0.13, 0.03, -0.14, 0.02, 30, 54];
    block(g, tower, 0xf1e3c4, 0xd4c09b);
    pane(g, "l", 0.02, -0.13, 0.03, 51, 54, 0xfff4dc);
    const [cx, cy] = iso([-0.05, 0.02, 43]);
    ellipse(g, 0xfffaf0, cx, cy, 11, 12);
    line(g, 0x5d4a43, 1.2, cx, cy, cx, cy - 4);
    line(g, 0x5d4a43, 1.2, cx, cy, cx + 3, cy + 1);
    pyramid(g, tower, 14, 0x7fae9c, 0x5f8d7d);
    flag(g, -0.05, -0.06, 14, 0xd9574e, 68);
    // Columned portico with steps and a pediment.
    block(g, [-0.2, 0.16, 0.4, 0.46, 0, 2], 0xe9dcc0, 0xcbb995, 0xf3e8d0);
    block(g, [-0.22, 0.18, 0.3, 0.4, 0, 4], 0xe9dcc0, 0xcbb995, 0xf3e8d0);
    for (const x of [-0.18, -0.08, 0.04, 0.14])
      line(g, 0xfff6e2, 4, ...iso([x, 0.37, 4]), ...iso([x, 0.37, 26]));
    block(g, [-0.22, 0.18, 0.3, 0.4, 26, 30], 0xf3e6c8, 0xd4c09b, 0xe9dcc0);
    gable(g, [-0.22, 0.18, 0.3, 0.4, 0, 30], 10, "y", 0x8a9ea0, 0x6f8487, 0xf7ecd2);
  },
  hospitalCrescent: (g) => hospital(g, "crescent"),
  smallFarm(g) {
    const barn: Box = [-0.34, 0.04, -0.32, 0.12, 0, 22];
    shadow(g, [-0.34, 0.3, -0.32, 0.36, 0, 0]);
    pad(g, -0.36, 0.0, 0.2, 0.32, 0x9b6d45);
    for (const u of [-0.3, -0.18, -0.06])
      for (const v of [0.23, 0.29]) ellipse(g, 0x6fa35f, ...iso([u, v, 2]), 7, 4);
    block(g, barn, 0xc0574b, 0x9b453b);
    win(g, "r", 0.04, -0.2, -0.1, 9, 16);
    gable(g, barn, 20, "y", 0x7d6f63, 0x645850, 0xc0574b);
    pane(g, "l", 0.12, -0.24, -0.06, 0, 16, 0xfff3d8);
    pane(g, "l", 0.12, -0.225, -0.075, 0, 14.5, 0x8a3a32);
    trim(g, 0xfff3d8, 1.4, [-0.225, 0.12, 0], [-0.075, 0.12, 14.5]);
    trim(g, 0xfff3d8, 1.4, [-0.225, 0.12, 14.5], [-0.075, 0.12, 0]);
    pane(g, "l", 0.12, -0.18, -0.12, 26, 32, 0x5d4a43);
    const [sx, sy] = iso([0.2, -0.18, 0]);
    cylinder(g, sx, sy, 10, 5, 44, 0xd9d6cc, 0xc4c1b6);
    for (const z of [12, 24, 36])
      g.lineStyle(1.2, 0xb4afa2).strokePoints(
        Array.from({ length: 9 }, (_, i) => ({
          x: sx + 10 * Math.cos((Math.PI * i) / 8),
          y: sy - z + 5 * Math.sin((Math.PI * i) / 8),
        })),
      );
    ellipse(g, 0x9aa3a6, sx, sy - 44, 20, 10);
    ellipse(g, 0xaeb7ba, sx - 1, sy - 47, 16, 9);
    const [hx, hy] = iso([0.2, 0.18, 0]);
    ellipse(g, 0xd9b45f, hx, hy - 5, 17, 12);
    ellipse(g, 0xeccf7e, hx - 2, hy - 7, 10, 8);
    fence(g, [[-0.38, 0.36], [-0.16, 0.36], [0.06, 0.36], [0.3, 0.36], [0.3, 0.14], [0.3, -0.06]]);
  },
  windmill(g) {
    const [b, t, top] = [0.2, 0.12, 50];
    shadow(g, [-b, b, -b, b, 0, 0]);
    face(g, 0xf3e5bd, [-b, b, 0], [b, b, 0], [t, t, top], [-t, t, top]);
    face(g, 0xd5c69d, [b, -b, 0], [b, b, 0], [t, t, top], [t, -t, top]);
    pane(g, "l", b, -0.045, 0.045, 0, 14, 0x7c6650);
    win(g, "l", 0.165, -0.03, 0.03, 28, 34);
    win(g, "r", 0.155, -0.03, 0.03, 30, 36);
    const cap: Box = [-0.15, 0.15, -0.15, 0.15, 0, top];
    gable(g, cap, 16, "y", 0xc97a63, 0xa65a48, 0xb9634f);
    const hub = iso([0, 0.2, top + 4]);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 9 + (k * Math.PI) / 2;
      const pt = (r: number, s: number): [number, number] => {
        const [x0, y0] = onPlane(0.2, 0, top + 4, a, r);
        const [x1, y1] = onPlane(0.2, 0, top + 4, a + Math.PI / 2, s);
        return [x0 + x1 - hub[0], y0 + y1 - hub[1]];
      };
      poly(g, 0xfff7db, [...pt(9, 0), ...pt(33, 0), ...pt(33, 9), ...pt(9, 9)]);
      for (const s of [3, 6]) line(g, 0xcfb991, 1, ...pt(9, s), ...pt(33, s));
      for (const r of [17, 25]) line(g, 0xcfb991, 1, ...pt(r, 0), ...pt(r, 9));
      line(g, 0x8c7358, 2.5, ...hub, ...pt(35, 0));
    }
    ellipse(g, 0xa17f5b, ...hub, 8, 8);
    for (const [u, c] of [[-0.12, 0xf5b5c8], [0.1, 0xf4dd69], [0.16, 0xb9a3dd]] as const)
      ellipse(g, c, ...iso([u, 0.27, 3]), 6, 5);
  },
  carousel(g) {
    blob(g, 84, 34);
    const cy = -2;
    cylinder(g, 0, cy, 38, 19, 5, 0x8a6a55, 0xe9d7b0);
    ellipse(g, 0xf4e6c4, 0, cy - 5, 62, 30);
    const at = (a: number): [number, number] => [27 * Math.cos(a), cy - 5 + 13.5 * Math.sin(a)];
    const pole = (a: number, color: number) => {
      const [x, y] = at(a);
      line(g, 0xe8c675, 2, x, y, x, y - 43);
      horse(g, x, y - 15, color);
    };
    for (const [a, c] of [[3.5, 0xf4ead4], [4.7, 0xc9a27a], [5.9, 0xf4ead4]]) pole(a, c);
    g.fillStyle(0xf2d38a).fillRect(-4, cy - 51, 8, 46);
    for (const [a, c] of [[0.5, 0xc9a27a], [1.57, 0xf4ead4], [2.64, 0x9fc4d4]]) pole(a, c);
    cone(g, 0, cy - 48, 42, 21, 30, [0xdc6a5e, 0xfbe9c4], 8);
    scallops(g, 0, cy - 48, 42, 21, [0xf3c85d, 0xdc6a5e], 8);
    line(g, 0xa17f5b, 2, 0, cy - 78, 0, cy - 88);
    poly(g, 0x6b9f8d, [0, cy - 88, 11, cy - 85, 0, cy - 82]);
    ellipse(g, 0xf3c85d, 0, cy - 78, 6, 6);
  },
  balloon(g) {
    blob(g, 30, 12);
    const [cx, cy, rx, ry] = [0, -62, 28, 30];
    const width = (t: number) =>
      t < 0.55 ? Math.sqrt(1 - t * t) : 0.835 - ((t - 0.55) * (0.835 - 0.28)) / 0.7;
    const ts = Array.from({ length: 19 }, (_, i) => -1 + (2.25 * i) / 18);
    const us = Array.from({ length: 7 }, (_, k) => Math.sin(-Math.PI / 2 + (Math.PI * k) / 6));
    const colors = [0xd9574e, 0xf4c95d, 0xfbe9c4];
    for (let k = 0; k < 6; k++)
      poly(g, colors[k % 3], [
        ...ts.flatMap((t) => [cx + rx * width(t) * us[k], cy + ry * t]),
        ...[...ts].reverse().flatMap((t) => [cx + rx * width(t) * us[k + 1], cy + ry * t]),
      ]);
    ellipse(g, 0xffffff, cx - 10, cy - 12, 10, 16, 0.25);
    const neck = cy + ry * 1.25;
    g.fillStyle(0xb8574b).fillRect(cx - 8, neck - 2, 16, 4);
    line(g, 0x8c7358, 1, cx - 7, neck, cx - 5, neck + 10);
    line(g, 0x8c7358, 1, cx + 7, neck, cx + 5, neck + 10);
    block(g, [-0.07, 0.07, -0.07, 0.07, 5, 14], 0xc79a62, 0xa57c4b, 0xe2bd85);
    trim(g, 0x8c7358, 1, [0.07, 0.07, 5], [0.3, 0.25, 0]);
    line(g, 0x7a5a48, 2, ...iso([0.3, 0.25, 0]), ...iso([0.3, 0.25, 4]));
  },
  ferris(g) {
    shadow(g, [-0.4, 0.36, -0.16, 0.16, 0, 0]);
    block(g, [-0.38, 0.38, -0.16, 0.16, 0, 4], 0xd9c7a0, 0xb9a47c, 0xe6d6b2);
    const z = 54;
    const legs = (y: number) => {
      for (const x of [-0.3, 0.3]) line(g, 0x5f8378, 4, ...iso([x, y, 4]), ...iso([0, y, z]));
    };
    legs(-0.1);
    line(g, 0x4d6b62, 4, ...iso([0, -0.1, z]), ...iso([0, 0.1, z]));
    const ring = (r: number) =>
      Array.from({ length: 33 }, (_, i) => {
        const [x, y] = onPlane(0, 0, z, (Math.PI * 2 * i) / 32, r);
        return { x, y };
      });
    g.lineStyle(4, 0xd88a76).strokePoints(ring(34), true);
    g.lineStyle(2, 0xf2ba96).strokePoints(ring(28), true);
    const hub = iso([0, 0, z]);
    for (let i = 0; i < 8; i++)
      line(g, 0xe9b18d, 1.5, ...hub, ...onPlane(0, 0, z, (Math.PI * i) / 4, 34));
    for (let i = 0; i < 8; i++) {
      const [x, y] = onPlane(0, 0, z, (Math.PI * i) / 4 + Math.PI / 8, 34);
      line(g, 0x7a6858, 1.2, x, y, x, y + 3);
      g.fillStyle(i % 2 ? 0xf4d58a : 0x75a8a2).fillRoundedRect(x - 6, y + 3, 12, 9, 3);
      g.fillStyle(0xfff6e2).fillRect(x - 4, y + 5, 8, 3);
    }
    ellipse(g, 0xffe7ba, ...hub, 9, 9);
    legs(0.1);
    pad(g, 0.24, 0.36, 0.16, 0.3, 0xd9c7a0);
  },
  cake(g) {
    blob(g, 76, 30);
    const cy = 0;
    cylinder(g, 0, cy, 36, 18, 3, 0xdcd3c2, 0xf7f1e4);
    cylinder(g, 0, cy - 3, 28, 14, 16, 0xf3b8c0, 0xfde2e4);
    scallops(g, 0, cy - 19, 28, 14, [0xffffff], 7);
    cylinder(g, 0, cy - 19, 20, 10, 14, 0xfbe9c4, 0xfff6e2);
    scallops(g, 0, cy - 33, 20, 10, [0xf3b8c0], 6);
    cylinder(g, 0, cy - 33, 12, 6, 12, 0xf3b8c0, 0xfde2e4);
    for (const a of [0.4, 1.57, 2.7]) {
      ellipse(g, 0xd9574e, 24 * Math.cos(a), cy - 22 + 12 * Math.sin(a), 6, 6);
      ellipse(g, 0xd9574e, 16 * Math.cos(a), cy - 36 + 8 * Math.sin(a), 5, 5);
    }
    for (const x of [-5, 0, 5]) {
      g.fillStyle(x ? 0x9fc7d4 : 0xf4c95d).fillRect(x - 1.5, cy - 56, 3, 11);
      ellipse(g, 0xffd883, x, cy - 59, 4, 6);
    }
  },
  circus(g) {
    blob(g, 86, 36);
    const cy = 0;
    ellipse(g, 0xb8574b, 0, cy, 72, 36);
    stripes(g, 0, cy, 36, 18, 26, [0xd9574e, 0xfaecd0], 10);
    g.fillStyle(0x5a3b35).fillRoundedRect(-7, cy + 18 - 21, 14, 21, { tl: 7, tr: 7, bl: 0, br: 0 });
    poly(g, 0xfaecd0, [-7, cy - 3, -13, cy + 17, -7, cy + 18]);
    poly(g, 0xfaecd0, [7, cy - 3, 13, cy + 17, 7, cy + 18]);
    cone(g, 0, cy - 26, 40, 20, 34, [0xd9574e, 0xfaecd0], 10);
    scallops(g, 0, cy - 26, 40, 20, [0xf3c85d, 0x6b9f8d], 10);
    line(g, 0x7a6858, 2, 0, cy - 60, 0, cy - 74);
    poly(g, 0x6b9f8d, [0, cy - 74, 14, cy - 70, 0, cy - 66]);
    for (const [x, c] of [[-24, 0xf3c85d], [24, 0x6b9f8d]] as const) {
      line(g, 0x7a6858, 1.5, x, cy - 33, x, cy - 43);
      poly(g, c, [x, cy - 43, x + 7, cy - 41, x, cy - 39]);
    }
  },
  icecream(g) {
    const b: Box = [-0.26, 0.2, -0.24, 0.2, 0, 22];
    shadow(g, b);
    const [ux, uy] = iso([0.36, -0.3, 0]);
    ellipse(g, 0xd8c3a0, ux, uy - 8, 14, 6);
    line(g, 0x8c8577, 1.5, ux, uy, ux, uy - 24);
    cone(g, ux, uy - 22, 14, 7, 8, [0xf2a7b5, 0xfff6ee], 6);
    block(g, b, 0xc4e3d3, 0x9ec6b3, 0xf6efe1);
    flatRoof(g, b, 0xe8dfcc);
    pane(g, "l", 0.2, -0.18, 0.1, 6, 17, 0xfff5dd);
    pane(g, "l", 0.2, -0.16, 0.08, 9, 16, 0x8ab9c4);
    pane(g, "l", 0.2, -0.18, 0.1, 5, 7, 0xe0a964);
    door(g, "r", 0.2, -0.1, 0.02, 15, 0xe58f9e);
    for (let i = 0; i < 6; i++) {
      const a = -0.24 + i * 0.07;
      face(g, i % 2 ? 0xfff6ee : 0xf2a7b5, [a, 0.2, 21], [a + 0.07, 0.2, 21], [a + 0.07, 0.31, 16], [a, 0.31, 16]);
    }
    const [cx, cy] = iso([-0.03, -0.02, 22]);
    poly(g, 0xe0a964, [cx - 9, cy - 18, cx + 9, cy - 18, cx, cy]);
    line(g, 0xc48a48, 1, cx - 5, cy - 16, cx + 2, cy - 4);
    line(g, 0xc48a48, 1, cx + 5, cy - 16, cx - 2, cy - 4);
    ellipse(g, 0xf2c4c9, cx, cy - 22, 20, 15);
    ellipse(g, 0x9fd4bd, cx, cy - 32, 16, 13);
    ellipse(g, 0xd9574e, cx + 1, cy - 40, 5, 5);
  },
  funhouse(g) {
    const b: Box = [-0.3, 0.26, -0.28, 0.26, 0, 30];
    shadow(g, b);
    block(g, b, 0xf6d27a, 0xd8b05a);
    for (let i = 0; i < 8; i++) {
      const a = -0.3 + i * 0.07;
      face(g, 0x9a6bc0, [a, 0.26, 24], [a + 0.07, 0.26, 24], [a + 0.035, 0.26, 29]);
    }
    for (let i = 0; i < 8; i++) {
      const a = -0.28 + i * 0.0675;
      face(g, 0x7c4fa0, [0.26, a, 24], [0.26, a + 0.0675, 24], [0.26, a + 0.034, 29]);
    }
    pane(g, "l", 0.26, -0.075, 0.075, 0, 17, 0xd9574e);
    pane(g, "l", 0.26, -0.055, 0.055, 0, 14, 0x5a3b5c);
    for (const u of [-0.2, 0.15]) {
      const [x, y] = iso([u, 0.26, 14]);
      ellipse(g, 0xffffff, x, y, 10, 10);
      ellipse(g, 0x5a3b5c, x + 1, y + 1, 4, 4);
    }
    const [px, py] = iso([0.26, -0.01, 14]);
    ellipse(g, 0x8fc3c4, px, py, 12, 12);
    g.lineStyle(2, 0xd9574e).strokeCircle(px, py, 6);
    pyramid(g, b, 34, 0xa77bd0, 0x7c4fa0);
    const [sx, sy] = iso([-0.02, -0.01, 66]);
    const star = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 3 : 7;
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      return [sx + r * Math.cos(a), sy + r * Math.sin(a)];
    }).flat();
    poly(g, 0xf8d65a, star);
    for (const [u, v, z] of [[-0.14, 0.14, 40], [0.1, 0.1, 44], [0.16, -0.12, 38]] as V3[])
      ellipse(g, 0xf8d65a, ...iso([u, v, z]), 4, 4);
  },
  gift(g) {
    const b: Box = [-0.24, 0.2, -0.26, 0.18, 0, 34];
    shadow(g, b);
    block(g, b, 0xe0687c, 0xc04e64, 0xf08497);
    pane(g, "l", 0.18, -0.06, 0.02, 0, 34, 0xf6cf5f);
    pane(g, "r", 0.2, -0.08, 0, 0, 34, 0xd9b048);
    face(g, 0xf8dc7a, [-0.06, -0.26, 34], [0.02, -0.26, 34], [0.02, 0.18, 34], [-0.06, 0.18, 34]);
    face(g, 0xf8dc7a, [-0.24, -0.08, 34], [0.2, -0.08, 34], [0.2, 0, 34], [-0.24, 0, 34]);
    const [bx, by] = iso([-0.02, -0.04, 34]);
    poly(g, 0xf6cf5f, [bx, by, bx - 15, by - 11, bx - 13, by + 2]);
    poly(g, 0xf6cf5f, [bx, by, bx + 15, by - 11, bx + 13, by + 2]);
    poly(g, 0xd9b048, [bx, by, bx - 5, by + 9, bx - 2, by + 9]);
    poly(g, 0xd9b048, [bx, by, bx + 6, by + 8, bx + 3, by + 9]);
    ellipse(g, 0xf8dc7a, bx, by - 1, 7, 6);
    const small: Box = [0.24, 0.4, 0.08, 0.24, 0, 14];
    block(g, small, 0x75b3a8, 0x5a988d, 0x8cc7bc);
    pane(g, "l", 0.24, 0.3, 0.34, 0, 14, 0xfaf3e3);
    pane(g, "r", 0.4, 0.14, 0.18, 0, 14, 0xe5dccb);
    const [kx, ky] = iso([0.32, 0.16, 14]);
    ellipse(g, 0xfaf3e3, kx - 4, ky - 2, 7, 5);
    ellipse(g, 0xfaf3e3, kx + 4, ky - 2, 7, 5);
  },
  playground(g) {
    shadow(g, [-0.4, 0.3, -0.34, 0.3, 0, 0]);
    // Sandbox.
    block(g, [-0.4, -0.1, 0.1, 0.38, 0, 3], 0xc89a68, 0xa97d52, 0xd9b27e);
    pad(g, -0.37, -0.13, 0.13, 0.35, 0xf0dca0);
    face(g, 0xf0dca0, [-0.37, 0.13, 3], [-0.13, 0.13, 3], [-0.13, 0.35, 3], [-0.37, 0.35, 3]);
    const [bx, by] = iso([-0.22, 0.24, 3]);
    cylinder(g, bx, by, 4, 2, 6, 0xd9574e, 0xe57b6f);
    ellipse(g, 0xe0b56a, bx - 9, by + 2, 9, 5);
    // Swing set along x.
    const leg = (x: number, y: number) =>
      line(g, 0x5f8378, 3, ...iso([x, y, 0]), ...iso([x, -0.2, 34]));
    leg(-0.34, -0.34);
    leg(0.16, -0.34);
    line(g, 0x4d6b62, 3, ...iso([-0.34, -0.2, 34]), ...iso([0.16, -0.2, 34]));
    for (const [x, c] of [[-0.22, 0xf4c95d], [-0.02, 0xd9574e]] as const) {
      for (const y of [-0.23, -0.17]) trim(g, 0x7a6858, 1, [x, y, 34], [x, y, 11]);
      block(g, [x - 0.04, x + 0.04, -0.24, -0.16, 9, 11], c, c, c);
    }
    leg(-0.34, -0.06);
    leg(0.16, -0.06);
    // Slide tower.
    for (const [x, y] of [[0.12, 0.2], [0.3, 0.2], [0.3, 0.02]])
      line(g, 0x8c7358, 2.5, ...iso([x, y, 0]), ...iso([x, y, 34]));
    block(g, [0.12, 0.3, 0.02, 0.2, 20, 23], 0xc89a68, 0xa97d52, 0xd9b27e);
    pyramid(g, [0.12, 0.3, 0.02, 0.2, 0, 34], 12, 0xd97162, 0xb4594e);
    for (const z of [5, 10, 15])
      trim(g, 0xe0bd82, 1.5, [0.3, 0.05, z], [0.3, 0.17, z]);
    face(g, 0xd9b048, [0.26, 0.2, 21], [0.26, 0.4, 0], [0.26, 0.4, -3], [0.26, 0.2, 18]);
    face(g, 0xf4c95d, [0.15, 0.2, 21], [0.26, 0.2, 21], [0.26, 0.4, 0], [0.15, 0.4, 0]);
  },
  cow(g, { pen: links }) {
    pen(g, 0x9fc47e, () => {
      block(g, [-0.24, -0.1, -0.26, -0.18, 0, 4], 0xa98663, 0x8c6b4f, 0x7fb9c2);
      cow(g, ...at(0.08, -0.12));
      cow(g, ...at(-0.1, 0.12));
    }, links);
  },
  sheep(g, { pen: links }) {
    pen(g, 0xa6c983, () => {
      const [hx, hy] = at(-0.18, -0.2);
      ellipse(g, 0xd9b45f, hx, hy - 4, 12, 9);
      ellipse(g, 0xeccf7e, hx - 1, hy - 6, 7, 5);
      sheep(g, ...at(0.12, -0.14));
      sheep(g, ...at(-0.14, 0.04));
      sheep(g, ...at(0.1, 0.14));
    }, links);
  },
  chicken(g, { pen: links }) {
    pen(g, 0xe0d29a, () => {
      const coop: Box = [-0.26, -0.06, -0.26, -0.1, 0, 12];
      block(g, coop, 0xd7a46c, 0xb5844f);
      pane(g, "l", -0.1, -0.18, -0.13, 0, 6, 0x5d4a43);
      gable(g, coop, 8, "x", 0xc0675b, 0x9c4e45, 0xb5844f);
      chicken(g, ...at(0.12, -0.16), 0xf8f3df);
      chicken(g, ...at(-0.12, 0.1), 0xd58a65);
      chicken(g, ...at(0.04, 0.04), 0xf2cc57);
      chicken(g, ...at(0.18, 0.16), 0xf8f3df);
    }, links);
  },
  duck(g, { pen: links }) {
    pen(g, 0x9fc47e, () => {
      const [px, py] = at(-0.02, -0.02);
      ellipse(g, 0xdbd9ab, px, py, 46, 23);
      ellipse(g, 0x67b9c7, px, py, 40, 19);
      ellipse(g, 0x8bd1d4, px - 3, py - 2, 26, 11);
      duckling(g, px - 8, py + 1, 0xfff9df);
      duckling(g, px + 7, py + 4, 0xfff9df);
      duckling(g, ...at(0.18, 0.16), 0xf4d35e);
    }, links);
  },
  pond(g) {
    ellipse(g, 0x47694b, 4, 4, 74, 32, 0.12);
    ellipse(g, 0xdbd9ab, 0, 0, 72, 34);
    ellipse(g, 0x5faeb8, 0, -1, 64, 29);
    ellipse(g, 0x87cbd0, -5, -3, 42, 16);
    line(g, 0xc5e7da, 1.5, -16, -4, -4, -4);
    for (const [x, y] of [[-34, 2], [31, 5], [-18, 14], [16, -14], [6, 15]])
      ellipse(g, 0x9eaa8a, x, y, 7, 5);
    for (const [x, y] of [[14, -5], [21, 3]]) {
      ellipse(g, 0x6c966b, x, y, 9, 4);
      ellipse(g, 0xf3d1ba, x + 1, y - 1, 3, 3);
    }
    for (let i = 0; i < 4; i++) {
      const x = -30 + i * 3;
      line(g, 0x5d8b5d, 1.3, x, 0, x + (i % 2 ? 1 : -1), -11 - (i % 3) * 2);
      ellipse(g, 0x8a6142, x + (i % 2 ? 1 : -1), -11 - (i % 3) * 2, 2, 4);
    }
    duckling(g, -2, 4, 0xfff9df);
  },
  flowers(g) {
    const b: Box = [-0.28, 0.28, -0.16, 0.16, 0, 5];
    shadow(g, b);
    block(g, b, 0xb98955, 0x9b7048, 0xa77a50);
    face(g, 0x7a5a3e, [-0.25, -0.13, 5], [0.25, -0.13, 5], [0.25, 0.13, 5], [-0.25, 0.13, 5]);
    const colors = [0xf5b5c8, 0xf4dd69, 0xb9a3dd, 0xf1987d, 0xffffff];
    const items: [number, number, number][] = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++)
        items.push([-0.21 + i * 0.085, -0.08 + j * 0.08, colors[(i * 2 + j) % colors.length]]);
    for (const [u, v, c] of items.sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
      const [x, y] = iso([u, v, 5]);
      line(g, 0x5d8b5d, 1.2, x, y, x, y - 6);
      ellipse(g, 0x6f9b63, x - 2, y - 2, 4, 2.5);
      ellipse(g, c, x, y - 7, 5, 5);
      ellipse(g, 0xf3c85d, x, y - 7, 1.6, 1.6);
    }
  },
  fountain(g) {
    ellipse(g, 0xe2dccb, 0, 4, 76, 36);
    g.lineStyle(1, 0xcfc8b4).strokeEllipse(0, 4, 64, 30);
    cylinder(g, 0, 6, 27, 13, 7, 0xbdb5a0, 0xe2dccb);
    ellipse(g, 0x75bac1, 0, -1, 46, 21);
    ellipse(g, 0x9fd6da, -4, -2, 24, 9);
    g.fillStyle(0xd4cdb8).fillRect(-3, -21, 6, 20);
    cylinder(g, 0, -19, 11, 5, 3, 0xbdb5a0, 0xe2dccb);
    ellipse(g, 0x75bac1, 0, -22, 17, 7);
    line(g, 0x8ed7dc, 2.5, 0, -23, 0, -36);
    for (const side of [-1, 1])
      g.lineStyle(2, 0xbdebf0, 0.9).strokePoints(
        [[0, -34], [6, -37], [11, -32], [14, -21], [15, -8]].map(([x, y]) => ({ x: x * side, y })),
      );
    ellipse(g, 0xdff6f6, 0, -37, 6, 4);
  },
  mountain: (g) => peak(g, 58, 14),
  mountainSnow: (g) => peak(g, 68, 26),
  waterfall(g) {
    const b: Box = [-0.34, 0.3, -0.34, 0.04, 0, 44];
    shadow(g, b);
    block(g, b, 0x938a9e, 0x7e7b90, 0xa9c47c);
    for (const z of [13, 28]) {
      trim(g, 0x857c90, 1.5, [-0.34, 0.04, z], [0.3, 0.04, z + 2]);
      trim(g, 0x6f6c80, 1.5, [0.3, -0.34, z + 3], [0.3, 0.04, z]);
    }
    face(g, 0x83d0d5, [-0.07, -0.34, 44], [0.07, -0.34, 44], [0.07, 0.04, 44], [-0.07, 0.04, 44]);
    cluster(g, [
      [-0.26, -0.26, (x, y) => conifer(g, x, y - 44, 0.45)],
      [0.18, -0.24, (x, y) => conifer(g, x, y - 44, 0.4)],
      [-0.22, -0.02, (x, y) => leafy(g, x, y - 44, 0.42)],
    ]);
    pane(g, "l", 0.04, -0.07, 0.07, 0, 44, 0x83d0d5);
    pane(g, "l", 0.04, -0.04, -0.015, 0, 44, 0xbde9df);
    pane(g, "l", 0.04, 0.03, 0.05, 4, 40, 0xbde9df);
    const [px, py] = at(0.06, 0.18);
    ellipse(g, 0x9a988a, px, py, 56, 22);
    ellipse(g, 0x78bec6, px, py, 50, 18);
    ellipse(g, 0xd2eee1, px, py - 3, 22, 6);
  },
  grove(g) {
    cluster(g, [
      [-0.18, -0.16, (x, y) => leafy(g, x, y, 0.85)],
      [0.16, -0.12, (x, y) => leafy(g, x, y, 0.72)],
      [-0.14, 0.16, (x, y) => leafy(g, x, y, 0.78)],
      [0.16, 0.18, (x, y) => leafy(g, x, y, 0.9)],
      [0.02, 0.02, (x, y) => bush(g, x, y, 0.7)],
    ]);
  },
  pineForest(g) {
    cluster(g, [
      [-0.2, -0.2, (x, y) => conifer(g, x, y, 1)],
      [0.14, -0.22, (x, y) => conifer(g, x, y, 0.85)],
      [-0.02, 0, (x, y) => conifer(g, x, y, 1.1)],
      [-0.24, 0.14, (x, y) => conifer(g, x, y, 0.8)],
      [0.18, 0.12, (x, y) => conifer(g, x, y, 0.9)],
      [0.02, 0.26, (x, y) => conifer(g, x, y, 0.7)],
    ]);
  },
  autumnTrees(g) {
    const [orange, red, yellow] = [
      [0xd98b4a, 0xe9a85a, 0xf2c46d, 0xc9733e],
      [0xc4594a, 0xd9715c, 0xe8956f, 0xb04b3f],
      [0xd9b24a, 0xe8c85f, 0xf3dc86, 0xc79e3c],
    ];
    for (const [u, v, c] of [[-0.1, 0.24, 0xd98b4a], [0.2, 0.06, 0xc4594a], [0.06, 0.3, 0xe8c85f], [-0.28, 0.0, 0xd9715c]] as const)
      ellipse(g, c, ...at(u, v), 5, 2.5);
    cluster(g, [
      [-0.16, -0.18, (x, y) => leafy(g, x, y, 0.85, orange)],
      [0.16, -0.08, (x, y) => leafy(g, x, y, 0.75, red)],
      [-0.08, 0.14, (x, y) => leafy(g, x, y, 0.8, yellow)],
    ]);
  },
  orchard(g) {
    pad(g, -0.34, 0.34, -0.34, 0.34, 0x9cc27a);
    for (const v of [-0.17, 0.17]) pad(g, -0.3, 0.3, v - 0.05, v + 0.05, 0xa98a5e);
    const fruit = (x: number, y: number) => {
      leafy(g, x, y, 0.62, [0x5f9562, 0x77a96a, 0x8bb978, 0x6a9f62]);
      for (const [dx, dy] of [[-6, -19], [3, -24], [7, -16], [-1, -14]])
        ellipse(g, 0xd9574e, x + dx, y + dy, 3, 3);
    };
    cluster(g, [
      [-0.17, -0.17, fruit],
      [0.17, -0.17, fruit],
      [-0.17, 0.17, fruit],
      [0.17, 0.17, fruit],
      [0.3, 0.02, (x, y) => {
        g.fillStyle(0xb98955).fillRoundedRect(x - 5, y - 6, 10, 6, 2);
        for (const dx of [-2.5, 0, 2.5]) ellipse(g, 0xd9574e, x + dx, y - 7, 3, 3);
      }],
    ]);
  },
  bushes(g) {
    cluster(g, [
      [-0.2, -0.12, (x, y) => bush(g, x, y, 1.1)],
      [0.14, -0.18, (x, y) => bush(g, x, y, 0.9, 0x6d5bb0)],
      [-0.06, 0.12, (x, y) => bush(g, x, y, 1, 0xd9574e)],
      [0.22, 0.12, (x, y) => rock(g, x, y, 0.7)],
      [-0.26, 0.24, (x, y) => rock(g, x, y, 0.5)],
    ]);
    for (const [u, v, c] of [[0.06, -0.02, 0xf5b5c8], [0.1, 0.28, 0xf4dd69], [-0.3, 0.06, 0xffffff]] as const)
      ellipse(g, c, ...at(u, v), 4, 3);
  },
  rocks(g) {
    for (const [u, v] of [[-0.1, 0.06], [0.14, 0.1], [-0.18, -0.16]] as const)
      ellipse(g, 0x8aa477, ...at(u, v), 16, 6);
    cluster(g, [
      [-0.04, -0.06, (x, y) => rock(g, x, y, 1.6)],
      [0.2, -0.12, (x, y) => rock(g, x, y, 0.9)],
      [-0.22, 0.12, (x, y) => rock(g, x, y, 0.8)],
      [0.14, 0.18, (x, y) => rock(g, x, y, 0.6)],
    ]);
  },
  deer(g) {
    cluster(g, [
      [-0.24, -0.2, (x, y) => conifer(g, x, y, 0.9)],
      [0.1, -0.26, (x, y) => leafy(g, x, y, 0.75)],
      [-0.26, 0.1, (x, y) => bush(g, x, y, 0.8)],
      [0.2, 0.04, (x, y) => deer(g, x, y, true)],
      [0.0, 0.26, (x, y) => deer(g, x, y, false)],
    ]);
  },
  horses(g, { pen: links }) {
    pen(g, 0x9fc47e, () => {
      const [hx, hy] = at(-0.18, -0.2);
      ellipse(g, 0xd9b45f, hx, hy - 4, 12, 9);
      ellipse(g, 0xeccf7e, hx - 1, hy - 6, 7, 5);
      pony(g, ...at(0.1, -0.12), 0x9b6a45, 0x4a3a2e);
      pony(g, ...at(-0.1, 0.12), 0xefe7d8, 0xc9bba3);
    }, links);
  },
  goats(g, { pen: links }) {
    pen(g, 0xa9c486, () => {
      const [rx, ry] = at(-0.14, -0.14);
      rock(g, rx, ry, 1.3);
      goat(g, rx, ry - 12, 0xf4efe3);
      goat(g, ...at(0.14, -0.06), 0x9b7a5c);
      goat(g, ...at(0.0, 0.14), 0xd9d3c3);
    }, links);
  },
  tent(g) {
    const small = (u: number, v: number, roof: number, shade: number, end: number) => {
      const t: Box = [u - 0.1, u + 0.1, v - 0.13, v + 0.09, 0, 0];
      shadow(g, t);
      gable(g, t, 18, "y", roof, shade, end);
      face(g, 0x2f5b56, [u - 0.055, v + 0.09, 0], [u + 0.055, v + 0.09, 0], [u, v + 0.09, 13]);
    };
    small(0.14, -0.2, 0xf0b878, 0xc27a3e, 0xe39a55);
    small(-0.2, 0.1, 0x7cc4b6, 0x3f8c84, 0x6db8ab);
    const [fx, fy] = at(0.14, 0.2);
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7;
      ellipse(g, 0x9a988a, fx + 7 * Math.cos(a), fy + 3.5 * Math.sin(a), 4, 3);
    }
    line(g, 0x8a6142, 2, fx - 4, fy + 1, fx + 4, fy - 1);
    line(g, 0x6f4e36, 2, fx - 4, fy - 1, fx + 4, fy + 1);
    poly(g, 0xe6a653, [fx - 4, fy, fx - 1, fy - 10, fx + 1, fy - 5, fx + 3, fy - 8, fx + 4, fy]);
    poly(g, 0xffd883, [fx - 2, fy, fx, fy - 6, fx + 2, fy]);
    const [lx, ly] = at(0.3, 0.1);
    line(g, 0x8a6142, 4, lx - 8, ly + 3, lx + 6, ly - 3);
  },
  apartment(g) {
    const b: Box = [-0.3, 0.28, -0.28, 0.26, 0, 58];
    shadow(g, b);
    block(g, b, 0xe9d6c0, 0xc9b49c, 0xc9cfcc);
    flatRoof(g, b, 0xb7bebb);
    for (const z of [19, 38]) {
      pane(g, "l", 0.26, -0.3, 0.28, z, z + 1.5, 0xd8c3a8);
      pane(g, "r", 0.28, -0.28, 0.26, z, z + 1.5, 0xb6a189);
    }
    for (const z of [6, 24, 43]) {
      for (const [a, c] of [[-0.25, -0.15], [0.14, 0.23]]) win(g, "l", 0.26, a, c, z, z + 9);
      for (const [a, c] of [[-0.2, -0.1], [0.05, 0.15]]) win(g, "r", 0.28, a, c, z, z + 9);
    }
    door(g, "l", 0.26, -0.05, 0.05, 15, 0x6a8fa8);
    for (const z of [24, 43]) {
      win(g, "l", 0.26, -0.05, 0.05, z, z + 11);
      block(g, [-0.08, 0.08, 0.26, 0.32, z - 1, z + 1], 0xd8d2bd, 0xb9b2a1, 0xe2ddd0);
      for (const x of [-0.08, 0, 0.08]) trim(g, 0x8c8577, 1, [x, 0.32, z + 1], [x, 0.32, z + 6]);
      trim(g, 0x8c8577, 1.2, [-0.08, 0.32, z + 6], [0.08, 0.32, z + 6]);
    }
    block(g, [-0.16, -0.04, -0.18, -0.06, 58, 66], 0xa9b0ad, 0x8e9592, 0xbac1be);
  },
  market(g) {
    const b: Box = [-0.3, 0.28, -0.24, 0.22, 0, 24];
    shadow(g, b);
    block(g, b, 0xf3ead6, 0xd9cdb4, 0xd9d3c3);
    flatRoof(g, b, 0xc9c2b0);
    pane(g, "l", 0.22, -0.26, 0.1, 4, 16, 0xfff5dd);
    pane(g, "l", 0.22, -0.24, 0.08, 5.5, 15, 0x8ab9c4);
    door(g, "l", 0.22, 0.14, 0.24, 16, 0x5f8577);
    win(g, "r", 0.28, -0.16, -0.02, 8, 16);
    win(g, "r", 0.28, 0.04, 0.16, 8, 16);
    awning(g, 0.22, -0.3, 0.28, 21, [0x5f9a6e, 0xfff6ee]);
    pane(g, "l", 0.22, -0.22, 0.12, 24, 31, 0x5f9a6e);
    for (const [a, c] of [[-0.18, -0.12], [-0.09, -0.03], [0.0, 0.08]])
      pane(g, "l", 0.22, a, c, 26.5, 28.5, 0xfff6ee);
    for (const [u, fruit] of [[-0.22, 0xd9574e], [-0.1, 0xf2a03d], [0.02, 0x8cc063]] as const) {
      block(g, [u - 0.05, u + 0.05, 0.31, 0.39, 0, 6], 0xc89a68, 0xa97d52, 0xd9b27e);
      for (const [du, dv] of [[-0.02, -0.02], [0.02, 0.0], [-0.01, 0.025]])
        ellipse(g, fruit, ...iso([u + du, 0.35 + dv, 7]), 3.5, 3);
    }
  },
  bakery(g) {
    const b: Box = [-0.28, 0.26, -0.24, 0.22, 0, 26];
    shadow(g, b);
    block(g, b, 0xf2dcb4, 0xd4b98d);
    win(g, "l", 0.22, -0.22, -0.04, 7, 18);
    for (const u of [-0.19, -0.13, -0.07]) ellipse(g, 0xc98a4b, ...iso([u, 0.22, 9.5]), 6, 3.5);
    door(g, "l", 0.22, 0.06, 0.15, 17, 0x8a5a3c);
    win(g, "r", 0.26, -0.14, -0.02, 9, 18);
    win(g, "r", 0.26, 0.04, 0.14, 9, 18);
    gable(g, b, 20, "x", 0xb5664a, 0x8f4f3a, 0xd4b98d, () =>
      block(g, [-0.18, -0.1, -0.14, -0.06, 36, 56], ...brick),
    );
    for (const [dz, dx, w] of [[62, 0, 8], [69, 3, 10], [77, 1, 12]])
      ellipse(g, 0xffffff, iso([-0.14, -0.1, dz])[0] + dx, iso([-0.14, -0.1, dz])[1], w, w * 0.75, 0.55);
    line(g, 0x5d4a43, 1.5, ...iso([0.2, 0.22, 24]), ...iso([0.2, 0.31, 24]));
    const [sx, sy] = iso([0.2, 0.3, 18]);
    ellipse(g, 0x8a5a3c, sx, sy, 11, 11);
    ellipse(g, 0xe2b06a, sx, sy, 7, 4);
  },
  cafe(g) {
    const b: Box = [-0.32, 0.08, -0.28, 0.16, 0, 24];
    shadow(g, [-0.32, 0.3, -0.28, 0.34, 0, 0]);
    pad(g, 0.1, 0.38, -0.22, 0.28, 0xd9c3a0);
    block(g, b, 0xf4e3cf, 0xd8c3a9, 0xcabba6);
    flatRoof(g, b, 0xbcae98);
    pane(g, "l", 0.16, -0.27, -0.07, 5, 17, 0xfff5dd);
    pane(g, "l", 0.16, -0.25, -0.09, 6.5, 15.5, 0x8ab9c4);
    door(g, "l", 0.16, -0.02, 0.06, 16, 0x7b5c49);
    win(g, "r", 0.08, -0.2, -0.04, 7, 16);
    awning(g, 0.16, -0.3, 0.07, 21, [0xd9574e, 0xfff6ee]);
    pane(g, "l", 0.16, -0.22, -0.06, 24, 31, 0x7b5c49);
    const [cx, cy] = iso([-0.14, 0.16, 27.5]);
    ellipse(g, 0xfff6ee, cx, cy, 6, 5);
    const table = (x: number, y: number) => {
      for (const dx of [-6, 6]) g.fillStyle(0x8a6142).fillRoundedRect(x + dx - 1.5, y - 6, 3, 6, 1);
      line(g, 0x8c8577, 1.2, x, y, x, y - 19);
      ellipse(g, 0xf3ead6, x, y - 7, 11, 5);
      ellipse(g, 0xffffff, x + 2, y - 8, 3, 2);
      cone(g, x, y - 18, 9, 4.5, 6, [0xd9574e, 0xfff6ee], 6);
    };
    cluster(g, [
      [0.3, -0.14, table],
      [0.28, 0.16, table],
    ]);
  },
  mosque(g) {
    const b: Box = [-0.28, 0.24, -0.28, 0.2, 0, 24];
    shadow(g, [-0.42, 0.24, -0.28, 0.34, 0, 0]);
    block(g, b, 0xf1e8d6, 0xd4c8b0, 0xe2d8c3);
    pane(g, "l", 0.2, -0.28, 0.24, 21, 24, 0xdccfb2);
    pane(g, "r", 0.24, -0.28, 0.2, 21, 24, 0xc4b796);
    for (const [a, c] of [[-0.22, -0.14], [0.1, 0.18]]) archWin(g, "l", 0.2, a, c, 6, 14);
    for (const [a, c] of [[-0.2, -0.12], [0.04, 0.12]]) archWin(g, "r", 0.24, a, c, 6, 14);
    pane(g, "l", 0.2, -0.065, 0.025, 0, 15, 0xfff5dd);
    pane(g, "l", 0.2, -0.055, 0.015, 0, 14, 0x6f5a48);
    ellipse(g, 0x6f5a48, ...iso([-0.02, 0.2, 14]), 5, 4);
    const [cx, cy] = iso([-0.02, -0.04, 24]);
    cylinder(g, cx, cy, 17, 8.5, 6, 0xd4c8b0, 0xe2d8c3);
    poly(g, 0x7fa7b5, arc(cx, cy - 6, 17, 22, Math.PI, Math.PI * 2, 16));
    poly(g, 0x9cc0cc, arc(cx - 3, cy - 7, 9, 18, Math.PI * 1.05, Math.PI * 1.5, 8).concat([cx - 3, cy - 7]));
    line(g, 0xe2b84a, 1.5, cx, cy - 28, cx, cy - 34);
    crescent(g, cx, cy - 37, 3.5, 0xe2b84a);
    const [mx, my] = at(-0.38, 0.3);
    cylinder(g, mx, my, 5, 2.5, 58, 0xf1e8d6, 0xe2d8c3);
    g.lineStyle(1, 0xd4c8b0).lineBetween(mx + 2, my - 2, mx + 2, my - 56);
    cylinder(g, mx, my - 42, 8, 4, 3, 0xd4c8b0, 0xe8dfcc);
    cone(g, mx, my - 58, 5.5, 2.7, 15, [0x7fa7b5, 0x6f97a5], 2);
    line(g, 0xe2b84a, 1.2, mx, my - 73, mx, my - 77);
    crescent(g, mx, my - 80, 2.5, 0xe2b84a);
  },
  library(g) {
    const b: Box = [-0.32, 0.28, -0.26, 0.24, 0, 30];
    shadow(g, b);
    block(g, b, 0xb8674f, 0x96513e);
    pane(g, "l", 0.24, -0.32, 0.28, 0, 3, 0xe6d8bd);
    pane(g, "r", 0.28, -0.26, 0.24, 0, 3, 0xcbbd9f);
    pane(g, "l", 0.24, -0.32, 0.28, 27, 30, 0xf3e6c8);
    pane(g, "r", 0.28, -0.26, 0.24, 27, 30, 0xd8c8a6);
    for (const [a, c] of [[-0.27, -0.18], [0.13, 0.22]]) archWin(g, "l", 0.24, a, c, 7, 20);
    for (const [a, c] of [[-0.18, -0.09], [0.06, 0.15]]) archWin(g, "r", 0.28, a, c, 7, 20);
    door(g, "l", 0.24, -0.07, 0.03, 18, 0x5d4a43);
    block(g, [-0.11, 0.07, 0.24, 0.32, 0, 3], 0xe6d8bd, 0xcbbd9f, 0xf3e8d0);
    gable(g, b, 16, "y", 0x6f7f86, 0x56656b, 0xb8674f);
    const [ox, oy] = iso([-0.02, 0.24, 37]);
    ellipse(g, 0xf3e6c8, ox, oy, 10, 10);
    ellipse(g, 0x8ab9c4, ox, oy, 7, 7);
    const [lx, ly] = at(0.34, 0.3);
    line(g, 0x5d6b62, 2, lx, ly, lx, ly - 28);
    ellipse(g, 0xffe7a6, lx, ly - 30, 6, 6);
  },
  postOffice(g) {
    const b: Box = [-0.3, 0.28, -0.26, 0.22, 0, 28];
    shadow(g, b);
    block(g, b, 0xf3ead6, 0xd9cdb4, 0xd5cfbf);
    flatRoof(g, b, 0xc5bfae);
    pane(g, "l", 0.22, -0.3, 0.28, 20, 26, 0xf3c85d);
    pane(g, "r", 0.28, -0.26, 0.22, 20, 26, 0xd9ad3f);
    pane(g, "l", 0.22, -0.06, 0.06, 20.5, 25.5, 0xffffff);
    trim(g, 0x4f74a0, 1.2, [-0.06, 0.22, 25.5], [0, 0.22, 22.5], [0.06, 0.22, 25.5]);
    win(g, "l", 0.22, -0.25, -0.14, 7, 16);
    win(g, "l", 0.22, 0.13, 0.24, 7, 16);
    door(g, "l", 0.22, -0.06, 0.06, 17, 0x4f74a0);
    win(g, "r", 0.28, -0.18, -0.06, 7, 16);
    win(g, "r", 0.28, 0.04, 0.16, 7, 16);
    line(g, 0x5d6b62, 2, ...at(0.36, 0.24), ...iso([0.36, 0.24, 7]));
    block(g, [0.33, 0.39, 0.21, 0.27, 6, 15], 0xf3c85d, 0xd9ad3f, 0xf8d77a);
    pane(g, "l", 0.27, 0.34, 0.38, 11, 12.5, 0x5d4a43);
    flag(g, -0.38, 0.3, 46, 0xd9574e);
  },
};

// Footpath colours for doors that have their own path when no road is near.
const doorPaths: Partial<Record<DecorationKind, number>> = {
  house: 0xe6d8b0,
  houseBlue: 0xe6d8b0,
  houseRed: 0xe6d8b0,
  cottage: 0xd9c79a,
  apartment: 0xd8d2bd,
  bakery: 0xe6d8b0,
  postOffice: 0xd8d2bd,
  fireStation: 0xd8d2bd,
  policeStation: 0xd8d2bd,
  hospital: 0xd8d2bd,
  hospitalCrescent: 0xd8d2bd,
  school: 0xe6d8b0,
  mosque: 0xe6dcc6,
  windmill: 0xe6d8b0,
  funhouse: 0xe6d8b0,
};

export function decoration(g: G, kind: DecorationKind, context: ModelContext = {}) {
  const road = context.road ?? null;
  if (isRoadKind(kind)) {
    roadTile(g, kind, [false, false, false, false]);
    return;
  }
  if (isGrassKind(kind)) {
    grassTile(g, kind, [false, false, false, false]);
    return;
  }
  if (kind === "water") {
    waterTile(g, [false, false, false, false]);
    return;
  }
  if (isTrackOverlayKind(kind)) {
    // Cards show the structure on a straight piece of rail.
    const track: Track = { x: 0, y: 0, entry: 0, exit: 0 };
    drawTrack(g, track);
    trackDecoration(g, kind, track);
    return;
  }
  // A road in front of the door is carried up to it; otherwise a footpath.
  const door = entrances[kind];
  if (door && road) doorWalk(g, road, door);
  else if (door && doorPaths[kind] !== undefined)
    pad(g, door.u - door.w, door.u + door.w, door.from, 0.45, doorPaths[kind]!);
  const model = models[kind];
  if (model) {
    const scale = modelScale[kind] ?? 1;
    g.save().scaleCanvas(scale, scale);
    model(g, context);
    g.restore();
    return;
  }
  // Trees are drawn smaller so they sit in scale with rails and buildings.
  const tree = kind === "tree" || kind === "pine" || kind === "treeSmall" || kind === "blossom";
  if (tree) g.save().scaleCanvas(0.62, 0.62);
  ellipse(g, 0x47694b, 7, 3, 62, 22, 0.16);
  if (kind === "pine") {
    g.fillStyle(0x86634e).fillRoundedRect(-4, -31, 8, 34, 2);
    for (const [y, w] of [
      [-13, 29],
      [-29, 23],
      [-43, 17],
    ]) {
      poly(g, 0x39806a, [-w, y, 0, y - 42, w, y]);
      poly(g, 0x266852, [0, y - 42, w, y, 0, y + 4]);
      poly(g, 0x68a47a, [-w, y, 0, y - 42, -6, y - 7]);
    }
  } else if (kind === "tree") {
    line(g, 0x856750, 7, 0, 2, 0, -42);
    line(g, 0x856750, 4, 0, -23, -15, -40);
    ellipse(g, 0x619863, 0, -47, 57, 53);
    ellipse(g, 0x80b076, -16, -52, 34, 34);
    ellipse(g, 0x92bc7d, 1, -65, 34, 31);
    ellipse(g, 0x72a469, 21, -48, 29, 36);
    ellipse(g, 0xa5ca87, -9, -68, 14, 8);
  } else if (kind === "treeSmall") {
    line(g, 0x856750, 5, 0, 1, 0, -29);
    ellipse(g, 0x70a56d, 0, -35, 39, 35);
    ellipse(g, 0x94bd7d, -10, -41, 23, 21);
    ellipse(g, 0x5f9562, 12, -34, 22, 25);
  } else if (kind === "blossom") {
    line(g, 0x8b6955, 5, 0, 2, 0, -31);
    ellipse(g, 0x87ad72, 0, -39, 43, 36);
    for (const [x, y] of [[-14,-43],[1,-51],[14,-40],[-3,-32]]) {
      ellipse(g, 0xf3b6c4, x, y, 9, 8);
      ellipse(g, 0xffe1df, x + 2, y - 1, 4, 4);
    }
  }
  if (tree) g.restore();
}
// Stations and tunnels sit on a track, so they are modelled in the track's own
// frame: t runs along the rail (0..1, following curves), b is the sideways
// offset in tiles and z the height in pixels. That keeps them correct for
// every rail direction and for bends. Faces are lit from their world normal.
export type StructureLayer = "back" | "front" | "all";
type Frame = {
  at: (t: number, b: number, z: number) => [number, number];
  side: (t: number) => Point;
  tangent: (t: number) => Point;
};
const light = { x: -0.6, y: 0.8 };
const lightOn = (n: Point) => 1 + 0.14 * (n.x * light.x + n.y * light.y);
const neg = (p: Point) => ({ x: -p.x, y: -p.y });
function tint(color: number, f: number) {
  const c = (shift: number) => Math.min(255, Math.max(0, Math.round(((color >> shift) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

function railFrame(track: Track): Frame {
  const origin = project(track);
  const mid = sampleTrack(track, 0.5);
  // Positive b is the station side: the far side of a straight rail, so
  // buildings stand behind passing trains, and the outer side of a bend,
  // where there is room for a platform.
  const a = sampleTrack(track, 0).point;
  const c = sampleTrack(track, 1).point;
  const out = { x: mid.point.x - (a.x + c.x) / 2, y: mid.point.y - (a.y + c.y) / 2 };
  const n = { x: -mid.tangent.y, y: mid.tangent.x };
  const sign =
    Math.hypot(out.x, out.y) > 1e-6
      ? n.x * out.x + n.y * out.y > 0 ? 1 : -1
      : n.x + n.y > 0 ? -1 : 1;
  const side = (t: number) => {
    const { tangent } = sampleTrack(track, t);
    return { x: -tangent.y * sign, y: tangent.x * sign };
  };
  return {
    side,
    tangent: (t) => sampleTrack(track, t).tangent,
    at: (t, b, z) => {
      const { point } = sampleTrack(track, t);
      const s = side(t);
      const q = project({ x: point.x + s.x * b, y: point.y + s.y * b });
      return [q.x - origin.x, q.y - origin.y - z];
    },
  };
}

// How a structure splits around the train: each layer with its depth offset
// from the cell, so a train in the cell passes between them.
export function trackDecorationLayers(kind: DecorationKind, track: Track) {
  const origin = project(track).y;
  const ys = [0, 0.25, 0.5, 0.75, 1].map(
    (t) => project(sampleTrack(track, t).point).y - origin,
  );
  const [low, high] = [Math.min(...ys), Math.max(...ys)];
  if (kind === "tunnelStone" || kind === "tunnelGreen")
    return [{ layer: "all" as StructureLayer, depth: high + 1 }];
  // On the outside of a bend that faces the viewer the station is in front.
  const s = railFrame(track).side(0.5);
  const behind = s.x + s.y <= 1e-6;
  const under = behind ? low - 2 : high + 3;
  if (kind === "stationLarge")
    return [
      { layer: "back" as StructureLayer, depth: under },
      { layer: "front" as StructureLayer, depth: high + 2 },
    ];
  return [{ layer: "back" as StructureLayer, depth: under }];
}

export function trackDecoration(
  g: G,
  kind: DecorationKind,
  track: Track,
  layer: StructureLayer = "all",
) {
  const frame = railFrame(track);
  if (kind === "tunnelStone" || kind === "tunnelGreen") tunnel(g, frame, kind === "tunnelGreen");
  else station(g, frame, kind, layer);
}

function sweepTools(g: G, { at, side, tangent }: Frame) {
  const quad = (color: number, pts: V3[], alpha = 1) =>
    poly(g, color, pts.flatMap(([t, b, z]) => at(t, b, z)), alpha);
  const run = (t0: number, t1: number, b: number, z: number, n = 8): V3[] =>
    Array.from({ length: n + 1 }, (_, i) => [t0 + ((t1 - t0) * i) / n, b, z]);
  const depth = (pts: V3[]) => pts.reduce((sum, [t, b]) => sum + at(t, b, 0)[1], 0) / pts.length;
  const facing = (n: Point) => n.x + n.y > 1e-6;
  // A box swept along the rail; far faces are painted first, the top last.
  const box = (t0: number, t1: number, b0: number, b1: number, z0: number, z1: number, color: number, top?: number) => {
    const tm = (t0 + t1) / 2;
    const faces: { n: Point; pts: V3[] }[] = [
      { n: neg(side(tm)), pts: [...run(t0, t1, b0, z0), ...run(t0, t1, b0, z1).reverse()] },
      { n: side(tm), pts: [...run(t0, t1, b1, z0), ...run(t0, t1, b1, z1).reverse()] },
      { n: neg(tangent(t0)), pts: [[t0, b0, z0], [t0, b1, z0], [t0, b1, z1], [t0, b0, z1]] },
      { n: tangent(t1), pts: [[t1, b0, z0], [t1, b1, z0], [t1, b1, z1], [t1, b0, z1]] },
    ];
    faces.sort((a, b) => depth(a.pts) - depth(b.pts));
    for (const face of faces) quad(tint(color, lightOn(face.n)), face.pts);
    quad(top ?? tint(color, 1.08), [...run(t0, t1, b0, z1), ...run(t0, t1, b1, z1).reverse()]);
  };
  // A flat quad on the rail-facing side of something at offset b.
  const panel = (b: number, t0: number, t1: number, z0: number, z1: number, color: number) =>
    quad(color, [[t0, b, z0], [t1, b, z0], [t1, b, z1], [t0, b, z1]]);
  const post = (t: number, b: number, z0: number, z1: number, color: number, width = 2.5) =>
    line(g, color, width, ...at(t, b, z0), ...at(t, b, z1));
  return { quad, run, depth, facing, box, panel, post };
}

function station(g: G, frame: Frame, kind: DecorationKind, layer: StructureLayer) {
  const { at, tangent } = frame;
  const { quad, run, facing, box, panel, post } = sweepTools(g, frame);
  const back = layer !== "front";
  const front = layer !== "back";
  const platform = (b0: number, b1: number, wood = false) => {
    const near = Math.abs(b0) < Math.abs(b1) ? b0 : b1;
    box(0.03, 0.97, b0, b1, 0, 5, wood ? 0xb98955 : 0xd8ccb0, wood ? 0xd9b27e : 0xe8dcc0);
    const edge = near + (near > 0 ? 0.04 : -0.04);
    quad(wood ? 0xe6c690 : 0xfaf1dc, [...run(0.03, 0.97, near, 5), ...run(0.03, 0.97, edge, 5).reverse()]);
    if (!wood) quad(0xf3c85d, [...run(0.03, 0.97, edge + (near > 0 ? 0.01 : -0.01), 5), ...run(0.03, 0.97, edge + (near > 0 ? 0.025 : -0.025), 5).reverse()]);
    else for (let t = 0.1; t < 0.97; t += 0.12) line(g, 0xa77a50, 0.8, ...at(t, b0, 5), ...at(t, b1, 5));
  };

  if (kind === "stationSmall") {
    if (!back) return;
    platform(0.27, 0.6);
    box(0.36, 0.64, 0.42, 0.6, 5, 22, 0xe9dcbc);
    panel(0.42, 0.4, 0.5, 11, 18, 0x8ab9c4);
    panel(0.42, 0.53, 0.6, 5, 17, 0x6f8f87);
    box(0.14, 0.28, 0.42, 0.47, 5, 8, 0xb98955);
    for (const t of [0.1, 0.9]) post(t, 0.36, 5, 26, 0x4e6f68);
    box(0.06, 0.94, 0.29, 0.52, 26, 28, 0x6c8d83, 0x86a99d);
    panel(0.3, 0.38, 0.62, 20, 24.5, 0xfaf1dc);
    line(g, 0x567365, 1.2, ...at(0.42, 0.3, 22.2), ...at(0.58, 0.3, 22.2));
    return;
  }

  if (kind === "stationCountry") {
    if (!back) return;
    platform(0.27, 0.6, true);
    const [t0, t1, b0, b1, wall] = [0.3, 0.7, 0.38, 0.6, 20];
    box(t0, t1, b0, b1, 5, wall, 0xe8d6b0);
    panel(b0, 0.36, 0.45, 10, 17, 0x8ab9c4);
    panel(b0, 0.52, 0.61, 5, 17, 0x7b5c49);
    // Gable roof running along the rail.
    const bm = (b0 + b1) / 2;
    const ridge = wall + 13;
    quad(0x8c4a40, [[t0 - 0.03, bm, ridge], [t1 + 0.03, bm, ridge], [t1 + 0.03, b1 + 0.04, wall], [t0 - 0.03, b1 + 0.04, wall]]);
    for (const [t, n] of [[t0, neg(tangent(t0))], [t1, tangent(t1)]] as const)
      if (facing(n)) quad(tint(0xe8d6b0, lightOn(n)), [[t, b0, wall], [t, b1, wall], [t, bm, ridge - 1]]);
    quad(0xb3604f, [[t0 - 0.03, b0 - 0.04, wall], [t1 + 0.03, b0 - 0.04, wall], [t1 + 0.03, bm, ridge], [t0 - 0.03, bm, ridge]]);
    line(g, 0xd98a72, 1.5, ...at(t0 - 0.03, bm, ridge), ...at(t1 + 0.03, bm, ridge));
    post(0.15, 0.33, 5, 27, 0x5d4a43, 1.5);
    ellipse(g, 0xffe7a6, ...at(0.15, 0.33, 28), 5, 5);
    const [fx, fy] = at(0.85, 0.42, 5);
    g.fillStyle(0xa77a50).fillRoundedRect(fx - 4, fy - 6, 8, 6, 2);
    for (const [dx, c] of [[-2, 0xf5b5c8], [2, 0xf4dd69]] as const) ellipse(g, c, fx + dx, fy - 8, 4, 4);
    return;
  }

  // Large station: a glass train shed over the rail, platforms on both sides.
  const columns = [0.1, 0.5, 0.9];
  // The tall hall would hide the whole shed when a bend puts it in front.
  const s = frame.side(0.5);
  const hall = s.x + s.y <= 1e-6;
  if (back && hall) {
    box(0.15, 0.85, 0.5, 0.66, 0, 46, 0xece0c6, 0xd8ccb0);
    for (const [t0, t1] of [[0.2, 0.32], [0.68, 0.8]]) {
      panel(0.5, t0, t1, 12, 30, 0xfff5dd);
      panel(0.5, t0 + 0.015, t1 - 0.015, 13.5, 28.5, 0x8ab9c4);
    }
    const [cx, cy] = at(0.5, 0.5, 38);
    ellipse(g, 0x3f6568, cx, cy, 12, 12);
    ellipse(g, 0xfff3ce, cx, cy, 9, 9);
    line(g, 0x466666, 1, cx, cy, cx, cy - 3.5);
    line(g, 0x466666, 1, cx, cy, cx + 2.5, cy + 1);
  }
  if (back) {
    platform(0.27, 0.5);
    for (const t of columns) post(t, 0.42, 5, 30, 0x4e7580, 3);
  }
  if (!front) return;
  platform(-0.5, -0.27);
  for (const t of columns) post(t, -0.42, 5, 30, 0x4e7580, 3);
  const arch = (j: number) => {
    const b = -0.52 + (1.04 * j) / 8;
    return [b, 30 + 11 * Math.cos((Math.PI * b) / 1.04)] as const;
  };
  const panes: V3[][] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 8; j++) {
      const [ta, tb] = [0.02 + (0.96 * i) / 6, 0.02 + (0.96 * (i + 1)) / 6];
      const [b0, z0] = arch(j);
      const [b1, z1] = arch(j + 1);
      panes.push([[ta, b0, z0], [tb, b0, z0], [tb, b1, z1], [ta, b1, z1]]);
    }
  for (const pane of panes) quad(0xbfe0e4, pane, 0.5);
  for (const t of [0.02, 0.34, 0.66, 0.98])
    g.lineStyle(2, 0x4e7580).strokePoints(
      Array.from({ length: 9 }, (_, j) => {
        const [b, z] = arch(j);
        const [x, y] = at(t, b, z);
        return { x, y };
      }),
    );
  for (const j of [0, 4, 8]) {
    const [b, z] = arch(j);
    line(g, 0x4e7580, j === 4 ? 2.5 : 2, ...at(0.02, b, z), ...at(0.98, b, z));
  }
}

function tunnel(g: G, frame: Frame, green: boolean) {
  const { side, tangent } = frame;
  const { quad, depth, facing } = sweepTools(g, frame);
  const base = green ? 0x8db870 : 0x9fa395;
  const [H, W, t0, t1] = [46, 0.48, 0.02, 0.98];
  const profile = Array.from({ length: 11 }, (_, j) => {
    const b = -W + (2 * W * j) / 10;
    return [b, H * Math.pow(Math.max(0, 1 - (b / W) ** 2), 0.6)] as const;
  });
  // The hill is swept along the rail, so bends get a curved tunnel too.
  const quads: { color: number; pts: V3[] }[] = [];
  for (let i = 0; i < 8; i++) {
    const [ta, tb] = [t0 + ((t1 - t0) * i) / 8, t0 + ((t1 - t0) * (i + 1)) / 8];
    const s = side((ta + tb) / 2);
    for (let j = 0; j < 10; j++) {
      const [b0, z0] = profile[j];
      const [b1, z1] = profile[j + 1];
      const len = Math.hypot(z1 - z0, (b1 - b0) * 54);
      const h = -(z1 - z0) / len;
      const n = { x: s.x * h, y: s.y * h };
      const grain = 1 + (((i * 7 + j * 3) % 3) - 1) * 0.025;
      quads.push({
        color: tint(base, (1 + 0.18 * (n.x * light.x + n.y * light.y)) * grain),
        pts: [[ta, b0, z0], [tb, b0, z0], [tb, b1, z1], [ta, b1, z1]],
      });
    }
  }
  quads.sort((a, b) => depth(a.pts) - depth(b.pts));
  for (const { color, pts } of quads) quad(color, pts);

  if (green) {
    for (const [t, b] of [[0.3, -0.12], [0.55, 0.16], [0.75, -0.05]] as const) {
      const z = H * Math.pow(1 - (b / W) ** 2, 0.6);
      bush(g, ...frame.at(t, b, z - 2), 0.55, t > 0.5 ? 0xf5b5c8 : undefined);
    }
  } else {
    for (const [t, b] of [[0.3, 0.2], [0.65, -0.18]] as const) {
      const z = H * Math.pow(1 - (b / W) ** 2, 0.6);
      rock(g, ...frame.at(t, b, z - 3), 0.7);
    }
  }

  // Portals only where a mouth faces the viewer; the hill hides the others.
  for (const [t, n] of [[t0, neg(tangent(0))], [t1, tangent(1)]] as const) {
    if (!facing(n)) continue;
    const f = lightOn(n);
    quad(tint(green ? 0x7d6a52 : 0x8a8d80, f), [[t, -W, 0], ...profile.map(([b, z]) => [t, b, z] as V3), [t, W, 0]]);
    const stone = green ? 0xc9c0a2 : 0xb7b8a8;
    quad(tint(stone, f), [[t, -0.34, 0], [t, 0.34, 0], [t, 0.34, 36], [t, -0.34, 36]]);
    quad(tint(0xe8e0c6, f), [[t, -0.37, 36], [t, 0.37, 36], [t, 0.37, 39.5], [t, -0.37, 39.5]]);
    const inner = (a: number): V3 => [t, 0.22 * Math.cos(a), 20 + 12 * Math.sin(a)];
    const outer = (a: number): V3 => [t, 0.29 * Math.cos(a), 20 + 17 * Math.sin(a)];
    for (const s of [-1, 1])
      quad(tint(0xd7ceb0, f), [[t, 0.22 * s, 0], [t, 0.29 * s, 0], [t, 0.29 * s, 20], [t, 0.22 * s, 20]]);
    for (let k = 0; k < 7; k++) {
      const [a, b] = [(Math.PI * k) / 7, (Math.PI * (k + 1)) / 7];
      quad(tint(k % 2 ? 0xd7ceb0 : 0xc5bfa5, f), [inner(a), outer(a), outer(b), inner(b)]);
    }
    quad(0x2c3f3a, [
      [t, 0.22, 0],
      ...Array.from({ length: 13 }, (_, k) => inner((Math.PI * k) / 12)),
      [t, -0.22, 0],
    ]);
    quad(tint(0xede0bd, f), [[t, -0.035, 31], [t, 0.035, 31], [t, 0.05, 38], [t, -0.05, 38]]);
  }
}

// A little 3D locomotive: its boxes are projected in the direction of travel.
export function locomotive(g: G, point: Point, tangent: Point, wagon = false) {
  const scale = 0.76;
  const p = (forward: number, side: number, height: number) => {
    const pos = project({
      x: point.x + (tangent.x * forward - tangent.y * side) * scale,
      y: point.y + (tangent.y * forward + tangent.x * side) * scale,
    });
    return { x: pos.x, y: pos.y - height * scale };
  };
  const face = (color: number, coords: [number, number, number][]) => {
    g.fillStyle(color).fillPoints(
      coords.map((c) => p(...c)),
      true,
    );
  };
  const box = (
    a: number,
    b: number,
    w: number,
    bottom: number,
    top: number,
    colors: number[],
  ) => {
    const faces = [
      {
        color: colors[1],
        coords: [
          [a, -w, bottom],
          [b, -w, bottom],
          [b, -w, top],
          [a, -w, top],
        ],
      },
      {
        color: colors[1],
        coords: [
          [a, w, bottom],
          [b, w, bottom],
          [b, w, top],
          [a, w, top],
        ],
      },
      {
        color: colors[2],
        coords: [
          [a, -w, bottom],
          [a, w, bottom],
          [a, w, top],
          [a, -w, top],
        ],
      },
      {
        color: colors[2],
        coords: [
          [b, -w, bottom],
          [b, w, bottom],
          [b, w, top],
          [b, -w, top],
        ],
      },
    ];
    faces.sort(
      (f, h) =>
        f.coords.reduce(
          (s, c) => s + p(...(c as [number, number, number])).y,
          0,
        ) -
        h.coords.reduce(
          (s, c) => s + p(...(c as [number, number, number])).y,
          0,
        ),
    );
    for (const f of faces)
      face(f.color, f.coords as [number, number, number][]);
    face(colors[0], [
      [a, -w, top],
      [b, -w, top],
      [b, w, top],
      [a, w, top],
    ]);
  };
  const center = project(point);
  ellipse(g, 0x365044, center.x, center.y + 2, 31, 11, 0.18);
  for (const f of [-0.23, 0.2])
    for (const s of [-0.18, 0.18]) {
      const wheel = p(f, s, 3);
      ellipse(g, 0x344d47, wheel.x, wheel.y, 7, 8);
      ellipse(g, 0xccc5a1, wheel.x, wheel.y, 3, 3);
    }
  box(-0.36, 0.36, 0.17, 5, 10, [0xdeae69, 0xba7855, 0x986047]);
  if (wagon) {
    box(-0.29, 0.29, 0.16, 10, 21, [0xeecf8c, 0xc6a266, 0xaa8959]);
    return;
  }
  box(-0.29, -0.02, 0.16, 10, 34, [0x659f97, 0x377c79, 0x286660]);
  box(-0.33, 0.01, 0.21, 34, 38, [0x36594f, 0x28493f, 0x203e37]);
  box(0.0, 0.3, 0.13, 10, 23, [0x74b3a6, 0x4b958a, 0x3b7d73]);
  box(0.17, 0.26, 0.08, 23, 34, [0x3e6155, 0x2f5047, 0x233e37]);
  for (const s of [-0.165, 0.165])
    face(0xf7df9e, [
      [-0.25, s, 23],
      [-0.08, s, 23],
      [-0.08, s, 31],
      [-0.25, s, 31],
    ]);
  const light = p(0.31, 0, 19);
  ellipse(g, 0xffe6a0, light.x, light.y, 5, 5);
}
