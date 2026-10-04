import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBranch,
  advanceTrain,
  appendTrack,
  branchCandidate,
  candidate,
  extendFrom,
  isSwitch,
  openEnds,
  removableTrack,
  removeTrack,
  penLinks,
  doorsOnRoad,
  entrances,
  roadAtEntrance,
  roadNeighbours,
  same,
  toggleSwitch,
  createWorld,
  expandChunk,
  exposedChunkEdges,
  inside,
  nextCell,
  parseWorld,
  placeDecoration,
  sampleRoute,
  sampleTrack,
  trackLength,
  vectors,
  type Heading,
  type Track,
  type Turn,
  type World,
} from "../src/game/model.ts";
const fresh = (): World => ({
  version: 1,
  chunks: [{ x: 0, y: 0 }],
  tracks: [{ x: 8, y: 8, entry: 0, exit: 0 }],
  decorations: [],
  closed: false,
});
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
test("world expands in independent 24x24 chunks and only exposed edges remain", () => {
  const world = fresh();
  assert.equal(exposedChunkEdges(world).length, 4);
  assert.equal(expandChunk(world, { x: 0, y: 0 }, "x+"), true);
  assert.deepEqual(world.chunks, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  assert.equal(inside({ x: 24, y: 8 }, world), true);
  assert.equal(inside({ x: 48, y: 8 }, world), false);
  assert.equal(exposedChunkEdges(world).length, 6);
  assert.equal(expandChunk(world, { x: 1, y: 0 }, "y-"), true);
  assert.equal(inside({ x: 30, y: -1 }, world), true);
  assert.equal(exposedChunkEdges(world).length, 8);
});

test("old saves without chunk metadata migrate into the original board", () => {
  const legacy = fresh() as World & { chunks?: World["chunks"] };
  delete legacy.chunks;
  const parsed = parseWorld(JSON.stringify(legacy));
  assert.ok(parsed);
  assert.deepEqual(parsed.chunks, [{ x: 0, y: 0 }]);
});

test("all straight and curved pieces meet cell edges with continuous tangents", () => {
  for (let h = 0; h < 4; h++)
    for (const turn of [-1, 0, 1] as Turn[]) {
      const track: Track = {
        x: 8,
        y: 8,
        entry: h as Heading,
        exit: ((h + turn + 4) % 4) as Heading,
      };
      const a = sampleTrack(track, 0),
        b = sampleTrack(track, 1),
        v = vectors[h],
        out = vectors[track.exit];
      near(a.point.x, 8 - v.x / 2);
      near(a.point.y, 8 - v.y / 2);
      near(b.point.x, 8 + out.x / 2);
      near(b.point.y, 8 + out.y / 2);
      near(a.tangent.x, v.x);
      near(a.tangent.y, v.y);
      near(b.tangent.x, out.x);
      near(b.tangent.y, out.y);
      const next: Track = {
        ...nextCell(track),
        entry: track.exit,
        exit: track.exit,
      };
      near(b.point.x, sampleTrack(next, 0).point.x);
      near(b.point.y, sampleTrack(next, 0).point.y);
      near(
        Math.hypot(
          sampleTrack(track, 0.5).tangent.x,
          sampleTrack(track, 0.5).tangent.y,
        ),
        1,
      );
    }
});
test("each turn extends the endpoint, never mutating earlier pieces", () => {
  const world = fresh();
  const before = structuredClone(world.tracks[0]);
  assert.ok(appendTrack(world, 1));
  assert.deepEqual(world.tracks[0], before);
  assert.deepEqual(world.tracks[1], { x: 9, y: 8, entry: 0, exit: 1 });
  assert.ok(appendTrack(world, -1));
  assert.deepEqual(world.tracks[2], { x: 9, y: 9, entry: 1, exit: 0 });
});
test("rails and decorations cannot overlap or leave the map", () => {
  const world = fresh();
  assert.equal(placeDecoration(world, { x: 8, y: 8 }, "house"), false);
  assert.equal(placeDecoration(world, { x: -1, y: 0 }, "tree"), false);
  assert.ok(placeDecoration(world, { x: 9, y: 8 }, "tree"));
  assert.equal(placeDecoration(world, { x: 9, y: 8 }, "house"), false);
  assert.equal(candidate(world, 0), null);
  assert.equal(appendTrack(world, 0), false);
  world.tracks = [{ x: 23, y: 0, entry: 0, exit: 0 }];
  assert.equal(candidate(world, 1), null);
  assert.equal(inside({ x: 1.5, y: 1 }), false);
});
test("tracks can continue across an expanded chunk boundary", () => {
  const world = fresh();
  world.tracks = [{ x: 23, y: 8, entry: 0, exit: 0 }];
  assert.equal(candidate(world, 0), null);
  assert.equal(expandChunk(world, { x: 0, y: 0 }, "x+"), true);
  assert.deepEqual(candidate(world, 0), {
    x: 24,
    y: 8,
    entry: 0,
    exit: 0,
  });
});

test("adjacent roads join whatever their surface", () => {
  const world = fresh();
  assert.equal(placeDecoration(world, { x: 9, y: 9 }, "roadAsphalt"), true);
  assert.equal(placeDecoration(world, { x: 10, y: 9 }, "roadAsphalt"), true);
  assert.equal(placeDecoration(world, { x: 9, y: 10 }, "roadDirt"), true);
  assert.equal(placeDecoration(world, { x: 8, y: 10 }, "roadStone"), true);
  assert.equal(placeDecoration(world, { x: 8, y: 11 }, "water"), true);

  assert.deepEqual(roadNeighbours(world, { x: 9, y: 9 }), [
    "roadAsphalt",
    "roadDirt",
    null,
    null,
  ]);
  assert.deepEqual(roadNeighbours(world, { x: 9, y: 10 }), [
    null,
    null,
    "roadStone",
    "roadAsphalt",
  ]);
  assert.deepEqual(roadNeighbours(world, { x: 8, y: 10 }), [
    "roadDirt",
    null,
    null,
    null,
  ]);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
});

test("rail infrastructure can occupy a track but ordinary scenery cannot", () => {
  const world = fresh();
  assert.equal(placeDecoration(world, { x: 8, y: 8 }, "house"), false);
  assert.equal(placeDecoration(world, { x: 8, y: 8 }, "stationSmall"), true);
  assert.equal(placeDecoration(world, { x: 8, y: 8 }, "tunnelStone"), false);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);

  const noTrack = fresh();
  assert.equal(placeDecoration(noTrack, { x: 9, y: 8 }, "stationSmall"), false);
  assert.equal(placeDecoration(noTrack, { x: 9, y: 8 }, "water"), true);
  assert.deepEqual(parseWorld(JSON.stringify(noTrack)), noTrack);
});

test("compatible returns to the start close the loop without duplicate cells", () => {
  const world = fresh();
  for (const turn of [1, 1, 0, 1, 1] as Turn[])
    assert.ok(appendTrack(world, turn));
  assert.equal(world.closed, true);
  assert.equal(world.tracks.length, 6);
  assert.equal(appendTrack(world, 0), false);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
});
test("route sampling follows distance through straight and curved pieces", () => {
  const world = fresh();
  appendTrack(world, 1);
  appendTrack(world, 0);
  const length = world.tracks.reduce((n, t) => n + trackLength(t), 0);
  assert.deepEqual(
    sampleRoute(world.tracks, 0),
    sampleTrack(world.tracks[0], 0),
  );
  const end = sampleRoute(world.tracks, length),
    expected = sampleTrack(world.tracks.at(-1)!, 1);
  near(end.point.x, expected.point.x);
  near(end.point.y, expected.point.y);
  const bend = sampleRoute(world.tracks, 1 + Math.PI / 8),
    middle = sampleTrack(world.tracks[1], 0.5);
  near(bend.point.x, middle.point.x);
  near(bend.point.y, middle.point.y);
});
test("starter world has a valid connected route and round-trips through storage", () => {
  const world = createWorld();
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
  assert.equal(world.decorations.length, 16);
  assert.equal(world.tracks.length, 14);
});
test("corrupt, disconnected, unknown, duplicate, oversized and falsely closed saves are rejected", () => {
  for (const raw of [null, "", "no json", "{}", "null"])
    assert.equal(parseWorld(raw), null);
  const cases = [
    { ...fresh(), version: 2 },
    { ...fresh(), tracks: [] },
    { ...fresh(), closed: true },
    { ...fresh(), tracks: [{ x: 8, y: 8, entry: 0, exit: 2 }] },
    {
      ...fresh(),
      tracks: [...fresh().tracks, { x: 11, y: 8, entry: 0, exit: 0 }],
    },
    { ...fresh(), decorations: [{ x: 8, y: 8, kind: "tree" }] },
    { ...fresh(), decorations: [{ x: 9, y: 8, kind: "alien" }] },
    { ...fresh(), decorations: [{ x: 24, y: 8, kind: "tree" }] },
    { ...fresh(), decorations: [null] },
    { ...fresh(), tracks: Array(600).fill(fresh().tracks[0]) },
  ];
  for (const value of cases)
    assert.equal(parseWorld(JSON.stringify(value)), null);
});

test("grass is ground cover under objects and rails", () => {
  const world = fresh();
  assert.equal(placeDecoration(world, { x: 9, y: 9 }, "grassLight"), true);
  assert.equal(placeDecoration(world, { x: 9, y: 9 }, "grassDark"), false);
  assert.equal(placeDecoration(world, { x: 9, y: 9 }, "house"), true);
  assert.equal(placeDecoration(world, { x: 9, y: 9 }, "tree"), false);
  assert.equal(placeDecoration(world, { x: 8, y: 8 }, "grassDark"), true);

  const last = world.tracks.at(-1)!;
  const next = nextCell(last);
  assert.equal(placeDecoration(world, next, "grassLight"), true);
  assert.notEqual(candidate(world, 0), null);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
});

const line = () => {
  const world = fresh();
  appendTrack(world, 0);
  appendTrack(world, 0);
  return world;
};

test("straight rails branch into switches in four directions", () => {
  const world = line();
  const cell = { x: 9, y: 8 };
  assert.deepEqual(branchCandidate(world, cell, "forwardRight"), { ...cell, entry: 0, exit: 1 });
  assert.deepEqual(branchCandidate(world, cell, "forwardLeft"), { ...cell, entry: 0, exit: 3 });
  assert.deepEqual(branchCandidate(world, cell, "backRight"), { ...cell, entry: 2, exit: 3 });
  assert.deepEqual(branchCandidate(world, cell, "backLeft"), { ...cell, entry: 2, exit: 1 });
  assert.ok(addBranch(world, cell, "forwardRight"));
  assert.equal(isSwitch(world, cell), true);
  assert.equal(branchCandidate(world, cell, "forwardLeft"), null);
  const end = openEnds(world).find((e) => same(e.track, cell))!;
  assert.deepEqual(extendFrom(world, end, 0), { x: 9, y: 9, entry: 1, exit: 1 });
  assert.equal(placeDecoration(world, cell, "stationSmall"), false);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
});

test("switches steer facing trains", () => {
  const world = line();
  addBranch(world, { x: 9, y: 8 }, "forwardRight");
  const start = { track: 0, forward: true, t: 0.5 };
  let moved = advanceTrain(world, start, 1)!;
  assert.deepEqual(world.tracks[moved.track], { x: 9, y: 8, entry: 0, exit: 0 });
  assert.ok(toggleSwitch(world, { x: 9, y: 8 }));
  assert.deepEqual(world.switches, ["9,8"]);
  moved = advanceTrain(world, start, 1)!;
  assert.deepEqual(world.tracks[moved.track], { x: 9, y: 8, entry: 0, exit: 1 });
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
  assert.ok(toggleSwitch(world, { x: 9, y: 8 }));
  assert.equal(world.switches, undefined);
});

test("trains turn around at dead ends and wagons stop there", () => {
  const world = fresh();
  const turned = advanceTrain(world, { track: 0, forward: true, t: 0.5 }, 1)!;
  assert.equal(turned.forward, false);
  assert.ok(turned.t > 0 && turned.t < 1);
  assert.equal(
    advanceTrain(world, { track: 0, forward: true, t: 0.5 }, 1, { stopAtEnd: true }),
    null,
  );
});

test("only loose ends can be removed, keeping the network whole", () => {
  const world = line();
  assert.equal(removableTrack(world, { x: 9, y: 8 }), null);
  assert.deepEqual(removableTrack(world, { x: 10, y: 8 }), world.tracks[2]);
  addBranch(world, { x: 9, y: 8 }, "backLeft");
  toggleSwitch(world, { x: 9, y: 8 });
  assert.ok(removeTrack(world, { x: 9, y: 8 }));
  assert.equal(isSwitch(world, { x: 9, y: 8 }), false);
  assert.equal(world.switches, undefined);
  assert.deepEqual(parseWorld(JSON.stringify(world)), world);
});

test("malformed switches are rejected", () => {
  const two = fresh();
  two.tracks.push({ x: 8, y: 8, entry: 1, exit: 1 });
  assert.equal(parseWorld(JSON.stringify(two)), null);
  assert.equal(parseWorld(JSON.stringify({ ...line(), switches: ["9,8"] })), null);
});

test("roads in front of a door reach up to it", () => {
  const world = fresh();
  assert.ok(placeDecoration(world, { x: 9, y: 9 }, "hospitalCrescent"));
  assert.ok(placeDecoration(world, { x: 9, y: 10 }, "roadDirt"));
  assert.ok(placeDecoration(world, { x: 10, y: 9 }, "roadAsphalt"));
  assert.ok(placeDecoration(world, { x: 12, y: 12 }, "tree"));
  assert.ok(placeDecoration(world, { x: 12, y: 13 }, "roadStone"));
  const [hospital, , , tree] = world.decorations;
  // Only the road on the door's side counts.
  assert.equal(roadAtEntrance(world, hospital), "roadDirt");
  assert.deepEqual(doorsOnRoad(world, { x: 9, y: 10 }), [
    null,
    null,
    null,
    entrances.hospitalCrescent,
  ]);
  assert.deepEqual(doorsOnRoad(world, { x: 10, y: 9 }), [null, null, null, null]);
  // Trees have no door.
  assert.equal(roadAtEntrance(world, tree), null);
  assert.deepEqual(doorsOnRoad(world, { x: 12, y: 13 }), [null, null, null, null]);
});

test("neighbouring animal pens of any kind join into one", () => {
  const world = fresh();
  for (const [x, y, kind] of [
    [10, 10, "cow"],
    [11, 10, "sheep"],
    [10, 11, "goats"],
    [11, 11, "chicken"],
    [13, 13, "duck"],
    [14, 14, "horses"],
    [12, 10, "tree"],
  ] as const)
    assert.ok(placeDecoration(world, { x, y }, kind));
  assert.deepEqual(penLinks(world, { x: 10, y: 10 }), {
    sides: [true, true, false, false],
    corners: [true, false, false, false],
  });
  // A tree beside a pen does not join it.
  assert.deepEqual(penLinks(world, { x: 11, y: 10 }).sides, [false, true, true, false]);
  // Diagonal neighbours stay apart.
  assert.deepEqual(penLinks(world, { x: 13, y: 13 }), {
    sides: [false, false, false, false],
    corners: [false, false, false, false],
  });
});
