import Phaser from "phaser";
import {
  sampleTrack,
  SIZE,
  type DecorationKind,
  type Point,
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
export function ground(g: G) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
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
      if ((x * 7 + y * 13) % 11 === 0) {
        line(g, 0x8fb570, 1.5, 14, 1, 12, -3);
        line(g, 0x8fb570, 1.5, 14, 1, 17, -2);
      }
      if ((x * 13 + y * 7) % 37 === 0) {
        ellipse(g, 0xf8edb5, -12, 3, 3, 2);
        ellipse(g, 0xffffff, -8, 6, 3, 2);
      }
      g.restore();
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
export function decoration(g: G, kind: DecorationKind) {
  ellipse(g, 0x47694b, 7, 3, kind === "waterfall" ? 92 : 62, 22, 0.16);
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
  } else if (kind === "house") {
    poly(g, 0xf5e9ca, [-27, -9, 5, 7, 5, -33, -27, -47]);
    poly(g, 0xdec9a6, [5, 7, 31, -7, 31, -45, 5, -33]);
    poly(g, 0xfff2d4, [-27, -47, -11, -66, 5, -33]);
    poly(g, 0xbe6453, [-33, -45, -11, -72, 38, -49, 13, -25]);
    poly(g, 0xdf8069, [-33, -45, -11, -72, -8, -65, -27, -41]);
    poly(g, 0xa95347, [-11, -72, 38, -49, 38, -44, -8, -65]);
    poly(g, 0x728778, [-19, -13, -9, -8, -9, -29, -19, -34]);
    poly(g, 0x86b6bd, [12, -17, 23, -23, 23, -35, 12, -29]);
    line(g, 0xfff3d5, 2, 17, -20, 17, -32);
    line(g, 0xfff3d5, 2, 12, -23, 23, -29);
    g.fillStyle(0xf5dcad).fillRect(17, -70, 7, 18);
    g.fillStyle(0xd1b391).fillRect(16, -72, 9, 4);
    ellipse(g, 0x68966a, -26, -2, 17, 10);
    ellipse(g, 0xe9c776, -29, -7, 4, 4);
  } else if (kind === "pond") {
    ellipse(g, 0xdbd9ab, 0, -1, 85, 44);
    ellipse(g, 0x5faeb8, 0, -3, 75, 36);
    ellipse(g, 0x87cbd0, -4, -6, 58, 25);
    line(g, 0xc5e7da, 2, -22, -10, -5, -10);
    line(g, 0xc5e7da, 2, 8, -2, 24, -2);
    ellipse(g, 0x6c966b, 21, -12, 10, 5);
    ellipse(g, 0xf3d1ba, 22, -14, 4, 4);
    ellipse(g, 0xfff9df, -8, 1, 11, 6);
    ellipse(g, 0xfff9df, -4, -4, 5, 8);
    poly(g, 0xe4ad53, [-2, -6, 3, -4, -2, -3]);
    ellipse(g, 0x9eaa8a, -33, 7, 10, 7);
  } else if (kind === "windmill") {
    poly(g, 0xf3e5bd, [-18, 0, 18, 0, 10, -62, -10, -62]);
    poly(g, 0xd5c69d, [5, 0, 18, 0, 10, -62, 4, -62]);
    poly(g, 0xbd6b55, [-16, -58, 0, -78, 16, -58]);
    g.fillStyle(0x7c8470).fillRoundedRect(-4, -16, 8, 16, 3);
    for (let i = 0; i < 4; i++) {
      g.save()
        .translateCanvas(0, -49)
        .rotateCanvas(Math.PI / 4 + (i * Math.PI) / 2);
      line(g, 0x8c7358, 3, 0, 0, 0, -34);
      poly(g, 0xfff7db, [2, -9, 12, -12, 10, -35, 2, -35]);
      g.restore();
    }
    ellipse(g, 0xa17f5b, 0, -49, 9, 9);
  } else if (kind === "balloon") {
    line(g, 0xa48c63, 1.5, -10, -33, -6, -12);
    line(g, 0xa48c63, 1.5, 10, -33, 6, -12);
    g.fillStyle(0xb98e5e).fillRoundedRect(-8, -14, 16, 12, 3);
    g.fillStyle(0xe1ba77).fillRect(-9, -14, 18, 4);
    ellipse(g, 0xd77e61, 0, -59, 57, 66);
    ellipse(g, 0xf2c679, 0, -59, 33, 66);
    ellipse(g, 0xf9e4b0, 0, -59, 12, 66);
    poly(g, 0xda986b, [-12, -35, 12, -35, 7, -27, -7, -27]);
  } else if (kind === "tent") {
    poly(g, 0x54a4a0, [-34, -1, -6, -48, 32, -27, 39, 9]);
    poly(g, 0x92cebc, [-34, -1, -6, -48, 11, 7]);
    poly(g, 0x397b7d, [-24, 0, -7, -31, 4, 5]);
    line(g, 0xe9dab2, 2, -6, -52, -6, -44);
    line(g, 0xe9dab2, 1, -6, -48, -40, 9);
    ellipse(g, 0x8a8871, -18, 17, 21, 9);
    poly(g, 0xe6a653, [-25, 17, -19, 2, -14, 12, -10, 6, -11, 18]);
    poly(g, 0xffd883, [-20, 17, -17, 9, -14, 18]);
  } else if (kind === "waterfall") {
    poly(
      g,
      0x938a9e,
      [-42, -2, -35, -63, -14, -82, 27, -75, 43, -43, 44, 2, 9, 17],
    );
    poly(g, 0x7e7b90, [9, 17, 4, -57, 27, -75, 43, -43, 44, 2]);
    ellipse(g, 0xb6cd83, -2, -68, 74, 33);
    ellipse(g, 0x92b26d, -8, -64, 47, 20);
    ellipse(g, 0x78bec6, 9, 13, 66, 25);
    poly(g, 0x83d0d5, [3, -65, 17, -65, 19, 10, 3, 13]);
    poly(g, 0xbde9df, [4, -64, 9, -64, 9, 11, 4, 9]);
    ellipse(g, 0xd2eee1, 10, 10, 25, 7);
    poly(g, 0x43816c, [-24, -71, -18, -99, -11, -70]);
    poly(g, 0x5e9875, [-11, -70, -5, -88, 1, -70]);
  } else if (kind === "ferris") {
    line(g, 0x6c8e83, 7, -21, 5, 0, -54);
    line(g, 0x56796e, 7, 23, 5, 0, -54);
    g.lineStyle(5, 0xd88a76).strokeCircle(0, -58, 38);
    g.lineStyle(2, 0xf2ba96).strokeCircle(0, -58, 33);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        x = Math.cos(a) * 38,
        y = -58 + Math.sin(a) * 38;
      line(g, 0xe9b18d, 2, 0, -58, x, y);
      g.fillStyle(i % 2 ? 0xf4d58a : 0x75a8a2).fillRoundedRect(
        x - 7,
        y,
        14,
        11,
        3,
      );
      line(g, 0xffedc8, 2, x - 6, y + 3, x + 6, y + 3);
    }
    ellipse(g, 0xffe7ba, 0, -58, 11, 11);
    line(g, 0x56796e, 5, -28, 7, -14, 7);
    line(g, 0x56796e, 5, 16, 7, 30, 7);
  }
}
// A little 3D locomotive: its boxes are projected in the direction of travel.
export function locomotive(g: G, point: Point, tangent: Point, wagon = false) {
  const p = (forward: number, side: number, height: number) => {
    const pos = project({
      x: point.x + tangent.x * forward - tangent.y * side,
      y: point.y + tangent.y * forward + tangent.x * side,
    });
    return { x: pos.x, y: pos.y - height };
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
  ellipse(g, 0x365044, center.x, center.y + 3, 40, 14, 0.2);
  for (const f of [-0.23, 0.2])
    for (const s of [-0.18, 0.18]) {
      const wheel = p(f, s, 3);
      ellipse(g, 0x344d47, wheel.x, wheel.y, 9, 10);
      ellipse(g, 0xccc5a1, wheel.x, wheel.y, 4, 4);
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
  ellipse(g, 0xffe6a0, light.x, light.y, 7, 7);
}
