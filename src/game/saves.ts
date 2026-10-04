import { parseWorld, type World } from "./model.ts";

// Named saves live together under one localStorage key, like a folder of
// save files. Each entry holds a full copy of the world.
export const SAVES_KEY = "webtrain-saves-v1";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export interface SaveEntry {
  id: string;
  name: string;
  savedAt: number;
  world: World;
}

// The JSON file written by export and accepted by import.
export interface SaveFile {
  format: "webtrain";
  version: 1;
  name: string;
  exportedAt: string;
  world: World;
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 60);

// Reads the saves, newest first, skipping anything that is not a valid world.
export function listSaves(storage: Storage): SaveEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(SAVES_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string") return [];
      const world = parseWorld(JSON.stringify(entry.world));
      if (!world || typeof entry.savedAt !== "number") return [];
      return [{ id: entry.id, name: entry.name, savedAt: entry.savedAt, world }];
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

// Saves under a name; a save with the same name is replaced. Throws when
// the browser refuses to store it (blocked storage or no space left).
export function writeSave(storage: Storage, name: string, world: World, now = Date.now()): SaveEntry {
  const label = cleanName(name) || "Dünyam";
  const saves = listSaves(storage);
  const existing = saves.find((s) => s.name.toLocaleLowerCase("tr") === label.toLocaleLowerCase("tr"));
  const entry: SaveEntry = {
    id: existing?.id ?? `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: label,
    savedAt: now,
    world: structuredClone(world),
  };
  storage.setItem(
    SAVES_KEY,
    JSON.stringify([entry, ...saves.filter((s) => s.id !== entry.id)]),
  );
  return entry;
}

export function deleteSave(storage: Storage, id: string) {
  storage.setItem(SAVES_KEY, JSON.stringify(listSaves(storage).filter((s) => s.id !== id)));
}

export function exportWorld(world: World, name: string, now = new Date()): string {
  const file: SaveFile = {
    format: "webtrain",
    version: 1,
    name: cleanName(name) || "Dünyam",
    exportedAt: now.toISOString(),
    world,
  };
  return JSON.stringify(file, null, 2);
}

// Accepts an exported file or a bare world; returns null for anything else.
export function importWorld(text: string): { world: World; name: string } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const file = data as Partial<SaveFile>;
  const wrapped = file.format === "webtrain";
  const world = parseWorld(JSON.stringify(wrapped ? file.world : data));
  if (!world) return null;
  return { world, name: wrapped && typeof file.name === "string" ? cleanName(file.name) : "" };
}

// A file name such as "webtrain-kuzey-koyu.json".
export function exportFileName(name: string) {
  const slug = cleanName(name)
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c]!)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `webtrain-${slug || "dunya"}.json`;
}
