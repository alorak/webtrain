import Phaser from "phaser";
import {
  CHUNK_SIZE,
  sampleTrack,
  type Chunk,
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
  } else if (kind === "flowers") {
    ellipse(g, 0x6f9b63, 0, -2, 63, 22);
    for (const [x, y, c] of [
      [-22,-8,0xf5b5c8],[-10,-13,0xf4dd69],[3,-8,0xb9a3dd],
      [18,-12,0xf1987d],[25,-3,0xf4dd69],[-2,-17,0xffffff]
    ] as const) {
      line(g, 0x5d8b5d, 2, x, y + 7, x, y);
      ellipse(g, c, x, y, 8, 7);
      ellipse(g, 0xf3c85d, x, y, 2.5, 2.5);
    }
  } else if (kind === "duck") {
    // A wide little pen with intentionally tiny ducks.
    const fence = [
      { x: -38, y: -4 },
      { x: 0, y: -23 },
      { x: 38, y: -4 },
      { x: 0, y: 15 },
    ];
    g.lineStyle(2.5, 0xb98955, 0.95).strokePoints(fence, true);
    g.lineStyle(1.5, 0xe0bd82, 0.95).strokePoints(
      fence.map((p) => ({ x: p.x, y: p.y - 7 })),
      true,
    );
    for (const p of fence) line(g, 0x9b7048, 3, p.x, p.y + 2, p.x, p.y - 12);

    ellipse(g, 0xffffff, -8, -9, 13, 8);
    ellipse(g, 0xffffff, -3, -15, 7, 7);
    poly(g, 0xe1a33d, [1, -15, 7, -13, 1, -11]);
    ellipse(g, 0x314943, -1, -17, 1.5, 1.5);
    line(g, 0xc7803c, 1, -10, -5, -11, -1);
    line(g, 0xc7803c, 1, -5, -5, -5, -1);

    for (const [x, y] of [
      [10, -3],
      [20, 2],
      [5, 5],
    ]) {
      ellipse(g, 0xf6d45e, x, y, 7, 5);
      ellipse(g, 0xf8df7a, x + 2, y - 4, 4.5, 4.5);
      poly(g, 0xd99736, [x + 4, y - 4, x + 8, y - 3, x + 4, y - 2]);
    }
  } else if (kind === "cow") {
    const fence = [
      { x: -38, y: -4 },
      { x: 0, y: -23 },
      { x: 38, y: -4 },
      { x: 0, y: 15 },
    ];
    g.lineStyle(2.5, 0xb98955, 0.95).strokePoints(fence, true);
    g.lineStyle(1.5, 0xe0bd82, 0.95).strokePoints(
      fence.map((p) => ({ x: p.x, y: p.y - 7 })),
      true,
    );
    for (const p of fence) line(g, 0x9b7048, 3, p.x, p.y + 2, p.x, p.y - 12);

    ellipse(g, 0xf4efe3, -2, -8, 35, 19);
    ellipse(g, 0xf6f0e4, 16, -13, 15, 13);
    ellipse(g, 0x5c5149, -10, -12, 11, 8);
    ellipse(g, 0x5c5149, 2, -4, 9, 7);
    ellipse(g, 0x5c5149, 18, -16, 6, 5);
    line(g, 0x5e5046, 2, -12, 0, -13, 10);
    line(g, 0x5e5046, 2, -1, 0, -1, 10);
    line(g, 0x5e5046, 2, 8, 0, 9, 9);
    poly(g, 0xb99a6d, [20, -20, 25, -25, 23, -18]);
    poly(g, 0xb99a6d, [12, -20, 8, -25, 10, -18]);
    ellipse(g, 0x2c403b, 20, -15, 1.8, 1.8);
  } else if (kind === "sheep") {
    const fence = [
      { x: -38, y: -4 },
      { x: 0, y: -23 },
      { x: 38, y: -4 },
      { x: 0, y: 15 },
    ];
    g.lineStyle(2.5, 0xb98955, 0.95).strokePoints(fence, true);
    g.lineStyle(1.5, 0xe0bd82, 0.95).strokePoints(
      fence.map((p) => ({ x: p.x, y: p.y - 7 })),
      true,
    );
    for (const p of fence) line(g, 0x9b7048, 3, p.x, p.y + 2, p.x, p.y - 12);

    for (const [x, y, scale] of [
      [-9, -8, 1],
      [17, 2, 0.72],
    ] as const) {
      ellipse(g, 0xf4f0dd, x, y, 28 * scale, 18 * scale);
      ellipse(g, 0xffffff, x - 6 * scale, y - 5 * scale, 15 * scale, 13 * scale);
      ellipse(g, 0x554e49, x + 13 * scale, y - 3 * scale, 10 * scale, 9 * scale);
      line(g, 0x554e49, 1.8 * scale, x - 7 * scale, y + 6 * scale, x - 7 * scale, y + 13 * scale);
      line(g, 0x554e49, 1.8 * scale, x + 5 * scale, y + 6 * scale, x + 5 * scale, y + 13 * scale);
      ellipse(g, 0x1f3430, x + 15 * scale, y - 5 * scale, 1.4 * scale, 1.4 * scale);
    }
  } else if (kind === "chicken") {
    const fence = [
      { x: -38, y: -4 }, { x: 0, y: -23 }, { x: 38, y: -4 }, { x: 0, y: 15 },
    ];
    g.lineStyle(2.5, 0xb98955, 0.95).strokePoints(fence, true);
    g.lineStyle(1.5, 0xe0bd82, 0.95).strokePoints(
      fence.map((p) => ({ x: p.x, y: p.y - 7 })), true,
    );
    for (const p of fence) line(g, 0x9b7048, 3, p.x, p.y + 2, p.x, p.y - 12);
    for (const [x, y, s, c] of [
      [-14,-8,1,0xf8f3df],[8,-4,0.82,0xd58a65],[19,4,0.62,0xf2cc57]
    ] as const) {
      ellipse(g, c, x, y, 15*s, 11*s);
      ellipse(g, c, x + 6*s, y - 7*s, 8*s, 8*s);
      poly(g, 0xe2a13f, [x+10*s,y-7*s,x+16*s,y-5*s,x+10*s,y-3*s]);
      poly(g, 0xd75c55, [x+4*s,y-12*s,x+7*s,y-17*s,x+9*s,y-11*s]);
      line(g, 0x8c6748, 1.3, x-3*s, y+5*s, x-4*s, y+11*s);
      line(g, 0x8c6748, 1.3, x+3*s, y+5*s, x+4*s, y+11*s);
    }
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
  } else if (kind === "houseBlue" || kind === "houseRed" || kind === "cottage") {
    const roof =
      kind === "houseBlue" ? 0x588aa8 : kind === "houseRed" ? 0xb85d52 : 0x8c765d;
    const wall =
      kind === "houseBlue" ? 0xf4e7c8 : kind === "houseRed" ? 0xf0dfc1 : 0xefe7d2;
    const scale = kind === "cottage" ? 0.82 : 0.9;
    g.save().scaleCanvas(scale, scale);
    poly(g, wall, [-25,-6,4,8,4,-31,-25,-44]);
    poly(g, 0xd7c39d, [4,8,29,-5,29,-42,4,-31]);
    poly(g, roof, [-31,-42,-10,-68,36,-46,12,-22]);
    poly(g, 0x6f7f73, [-17,-10,-8,-6,-8,-25,-17,-30]);
    poly(g, 0x8ab9c4, [11,-15,21,-20,21,-31,11,-26]);
    g.restore();
  } else if (kind === "farmhouse") {
    g.save().scaleCanvas(0.88, 0.88);
    poly(g, 0xf2dfb8, [-35,0,1,15,1,-31,-35,-47]);
    poly(g, 0xd5bd92, [1,15,38,-4,38,-49,1,-31]);
    poly(g, 0x9d4d45, [-43,-44,-13,-76,48,-51,13,-21]);
    poly(g, 0xf8efcf, [-8,-3,10,5,10,-27,-8,-35]);
    poly(g, 0x6e8875, [-28,-9,-18,-4,-18,-25,-28,-31]);
    poly(g, 0x83b7c1, [20,-17,31,-23,31,-35,20,-29]);
    g.fillStyle(0xd7b577).fillRoundedRect(-42, -8, 14, 7, 3);
    g.restore();
  } else if (kind === "mountain") {
    poly(g, 0x71806f, [-42, 4, -14, -55, 4, -23, 22, -70, 46, 4]);
    poly(g, 0x596b63, [4, -23, 22, -70, 46, 4, 18, -7]);
    poly(g, 0xf4f0dc, [9, -42, 22, -70, 31, -43, 23, -48, 18, -39]);
    poly(g, 0x8aa477, [-42, 4, -27, -19, -13, -8, 0, -24, 13, -9, 26, -17, 46, 4]);
  } else if (kind === "mountainSnow") {
    poly(g, 0x65736d, [-43,4,-20,-38,-6,-18,12,-70,45,4]);
    poly(g, 0x4d5f5a, [12,-70,45,4,17,-10,3,-30]);
    poly(g, 0xf4f0dd, [0,-42,12,-70,24,-43,17,-48,11,-39,6,-45]);
    poly(g, 0x8da675, [-43,4,-25,-16,-8,-5,5,-21,20,-8,45,4]);
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
  } else if (kind === "water") {
    poly(g, 0x67b9c7, [0,-21,42,0,0,21,-42,0]);
    poly(g, 0x8bd1d4, [0,-15,30,0,0,15,-30,0], 0.8);
    line(g, 0xe4f7ef, 1.5, -18, -2, -4, -2);
  } else if (kind === "fountain") {
    ellipse(g, 0x9db59e, 0, 3, 52, 24);
    ellipse(g, 0x75bac1, 0, 0, 43, 18);
    g.fillStyle(0xd4d2bd).fillRoundedRect(-5, -28, 10, 30, 3);
    ellipse(g, 0xdedcc6, 0, -29, 24, 10);
    line(g, 0x8ed7dc, 3, 0, -31, 0, -57);
    g.lineStyle(2, 0xbdebf0).beginPath().moveTo(0,-52).lineTo(-13,-36).strokePath();
    g.lineStyle(2, 0xbdebf0).beginPath().moveTo(0,-52).lineTo(13,-36).strokePath();
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
  } else if (kind === "carousel") {
    ellipse(g, 0x765b4c, 0, 2, 62, 22);
    poly(g, 0xe06d63, [-33,-35,0,-66,33,-35]);
    poly(g, 0xf7df9a, [-22,-35,0,-66,10,-35]);
    line(g, 0xc9a15d, 4, 0, 2, 0, -48);
    for (const x of [-19, 0, 19]) {
      line(g, 0xd7b86f, 2, x, -31, x, -5);
      ellipse(g, x === 0 ? 0x8eb5c4 : 0xf2c77e, x, -9, 16, 9);
      ellipse(g, 0xf4ead4, x + 5, -12, 6, 6);
    }
  } else if (kind === "cake") {
    ellipse(g, 0xe0b88d, 0, 2, 50, 19);
    g.fillStyle(0xf5cfcb).fillRoundedRect(-22, -27, 44, 28, 8);
    ellipse(g, 0xffeee0, 0, -27, 44, 13);
    for (const x of [-12,0,12]) {
      line(g, 0xe2a05a, 2, x, -33, x, -46);
      ellipse(g, 0xf5c45b, x, -48, 4, 7);
    }
  } else if (kind === "circus") {
    poly(g, 0xf7e2bd, [-35,4,35,4,25,-43,-25,-43]);
    poly(g, 0xd95f58, [-35,4,-25,-43,-8,4]);
    poly(g, 0xd95f58, [8,4,25,-43,35,4]);
    poly(g, 0xf3d07f, [-29,-43,0,-70,29,-43]);
    line(g, 0x7a6858, 2, 0, -70, 0, -82);
    poly(g, 0x6b9f8d, [0,-82,18,-77,0,-72]);
  } else if (kind === "icecream") {
    g.fillStyle(0xf5e8ca).fillRoundedRect(-27, -28, 54, 30, 5);
    poly(g, 0xb7665d, [-31,-28,31,-28,24,-45,-24,-45]);
    g.fillStyle(0x83a99d).fillRoundedRect(-8,-15,16,17,3);
    ellipse(g, 0xf2c4c9, -13, -51, 17, 17);
    ellipse(g, 0xf7df9f, 0, -56, 17, 17);
    ellipse(g, 0x9fc7b4, 13, -51, 17, 17);
  } else if (kind === "funhouse") {
    poly(g, 0xf0d7ae, [-30,1,30,1,30,-43,-30,-43]);
    poly(g, 0x9c67ad, [-36,-42,0,-70,36,-42]);
    g.fillStyle(0x79a7b1).fillRoundedRect(-10,-25,20,26,5);
    for (const x of [-20,20]) ellipse(g, 0xf0a36d, x, -27, 9, 12);
    ellipse(g, 0xf3d46a, 0, -50, 11, 11);
  } else if (kind === "gift") {
    g.fillStyle(0xd85f72).fillRoundedRect(-25,-31,50,33,6);
    g.fillStyle(0xf4cf68).fillRect(-4,-31,8,33);
    g.fillStyle(0xf4cf68).fillRect(-25,-18,50,7);
    ellipse(g, 0x7ca69d, -8, -37, 19, 11);
    ellipse(g, 0x7ca69d, 8, -37, 19, 11);
  } else if (kind === "playground") {
    line(g, 0x7d6856, 4, -26, 2, -17, -36);
    line(g, 0x7d6856, 4, 9, 2, 0, -36);
    line(g, 0x7d6856, 3, -17, -36, 0, -36);
    line(g, 0xd3a958, 2, -12, -34, -12, -8);
    line(g, 0xd3a958, 2, -5, -34, -5, -8);
    g.fillStyle(0x69a6b0).fillRoundedRect(-16,-9,15,5,2);
    poly(g, 0xd97162, [8,2,35,2,10,-31,-2,-31]);
  } else if (
    kind === "stationSmall" ||
    kind === "stationLarge" ||
    kind === "stationCountry" ||
    kind === "tunnelStone" ||
    kind === "tunnelGreen"
  ) {
    // Card preview only; in the world these are aligned to the selected track.
    if (kind.startsWith("tunnel")) {
      g.fillStyle(kind === "tunnelStone" ? 0x737a72 : 0x6f9a63)
        .fillRoundedRect(-31,-42,62,44,18);
      g.fillStyle(0x31443f).fillRoundedRect(-15,-29,30,31,12);
    } else {
      const roof = kind === "stationCountry" ? 0xa95c50 : 0x527b83;
      g.fillStyle(0xe8d9b8).fillRoundedRect(-28,-29,56,30,5);
      poly(g, roof, [-34,-28,0,-51,34,-28]);
      g.fillStyle(0x7f6650).fillRoundedRect(-7,-16,14,17,2);
      g.fillStyle(0xd9c28e).fillRoundedRect(-39,1,78,7,3);
    }
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
export function trackDecoration(g: G, kind: DecorationKind, track: Track) {
  const sample = sampleTrack(track, 0.5);
  const tangent = sample.tangent;
  const screen = {
    x: (tangent.x - tangent.y) * 48,
    y: (tangent.x + tangent.y) * 24,
  };
  const angle = Math.atan2(screen.y, screen.x);
  const center = project(track);
  const midpoint = project(sample.point);

  g.save()
    .translateCanvas(midpoint.x - center.x, midpoint.y - center.y)
    .rotateCanvas(angle);
  if (kind === "tunnelStone" || kind === "tunnelGreen") {
    const outer = kind === "tunnelStone" ? 0x747a72 : 0x6f9862;
    const inner = 0x30433e;
    g.fillStyle(outer).fillRoundedRect(-34, -47, 68, 56, 18);
    g.fillStyle(inner).fillRoundedRect(-18, -34, 36, 44, 14);
    if (kind === "tunnelGreen") {
      ellipse(g, 0x8eb879, -25, -39, 23, 15);
      ellipse(g, 0xa0c487, 19, -43, 26, 17);
    } else {
      for (const x of [-22, 0, 22]) line(g, 0x959b91, 2, x, -45, x + 4, -31);
    }
  } else {
    const large = kind === "stationLarge";
    const country = kind === "stationCountry";
    const width = large ? 82 : 64;
    g.fillStyle(0xd4bb82).fillRoundedRect(-width / 2, -5, width, 10, 3);
    g.fillStyle(country ? 0xefe0bb : 0xe7d5ad)
      .fillRoundedRect(-width * 0.31, -36, width * 0.62, 31, 4);
    poly(
      g,
      country ? 0xaa5c50 : large ? 0x4e7580 : 0x6c8d83,
      [-width * 0.38, -34, 0, -55, width * 0.38, -34],
    );
    g.fillStyle(0x785f4d).fillRoundedRect(-6, -23, 12, 18, 2);
    if (large) {
      g.fillStyle(0x88b8c2).fillRoundedRect(-29, -25, 13, 10, 2);
      g.fillStyle(0x88b8c2).fillRoundedRect(16, -25, 13, 10, 2);
    }
  }
  g.restore();
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
