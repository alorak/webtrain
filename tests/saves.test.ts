import { test } from "node:test";
import assert from "node:assert/strict";
import { appendTrack, createWorld, type World } from "../src/game/model.ts";
import {
  deleteSave,
  exportFileName,
  exportWorld,
  importWorld,
  listSaves,
  SAVES_KEY,
  writeSave,
} from "../src/game/saves.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

test("saves are listed newest first and same names are replaced", () => {
  const storage = memory();
  const world = createWorld();
  writeSave(storage, "Köy", world, 1);
  writeSave(storage, "Şehir", world, 2);
  const changed: World = structuredClone(world);
  appendTrack(changed, 0);
  writeSave(storage, "  köy ", changed, 3);
  const saves = listSaves(storage);
  assert.deepEqual(
    saves.map((s) => [s.name, s.savedAt]),
    [["köy", 3], ["Şehir", 2]],
  );
  assert.deepEqual(saves[0].world, changed);
  deleteSave(storage, saves[1].id);
  assert.deepEqual(listSaves(storage).map((s) => s.name), ["köy"]);
});

test("broken save data is ignored rather than crashing", () => {
  const storage = memory();
  storage.setItem(SAVES_KEY, "not json");
  assert.deepEqual(listSaves(storage), []);
  storage.setItem(
    SAVES_KEY,
    JSON.stringify([
      { id: "a", name: "bozuk", savedAt: 1, world: { version: 9 } },
      { id: "b", name: "iyi", savedAt: 2, world: createWorld() },
    ]),
  );
  assert.deepEqual(listSaves(storage).map((s) => s.name), ["iyi"]);
});

test("exported files import back, bare worlds too, junk does not", () => {
  const world = createWorld();
  const text = exportWorld(world, "Kuzey Köyü", new Date(0));
  assert.deepEqual(importWorld(text), { world, name: "Kuzey Köyü" });
  assert.deepEqual(importWorld(JSON.stringify(world)), { world, name: "" });
  assert.equal(importWorld("{}"), null);
  assert.equal(importWorld("nope"), null);
  assert.equal(
    importWorld(JSON.stringify({ format: "webtrain", world: { tracks: [] } })),
    null,
  );
  assert.equal(exportFileName("Kuzey Köyü!"), "webtrain-kuzey-koyu.json");
  assert.equal(exportFileName("   "), "webtrain-dunya.json");
});
