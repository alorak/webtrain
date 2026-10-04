import Phaser from "phaser";
import "./style.css";
import { WebTrainScene, type GameStatus } from "./scenes/WebTrainScene";
import { decoration } from "./game/art";
import {
  deleteSave,
  exportFileName,
  exportWorld,
  importWorld,
  listSaves,
  writeSave,
} from "./game/saves";
import {
  MAX_DWELL,
  MAX_WAGONS,
  isRoadKind,
  vectors,
  type Chunk,
  type ChunkEdge,
  type BranchKind,
  type DecorationKind,
  type Point,
  type Turn,
} from "./game/model";
const paths: Record<string, string> = {
  train:
    '<rect x="4" y="8" width="14" height="10" rx="3"/><path d="M7 8V4h7v4M18 11h3v7H3M7 21h.01M16 21h.01M8 12h5"/>',
  track: '<path d="m7 3-3 18M17 3l3 18M6 7h12M5 12h14M4 18h16"/>',
  tree: '<path d="m12 2-7 9h3l-5 7h18l-5-7h3L12 2ZM12 18v4"/>',
  house: '<path d="M3 11 12 3l9 8v10h-6v-6H9v6H3Z"/>',
  park: '<path d="m12 3 2.2 4.7 5.1.6-3.8 3.6 1 5.1-4.5-2.5L7.5 17l1-5.1-3.8-3.6 5.1-.6Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 17h.01"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12"/>',
  new: '<path d="M13 3H5v18h14V9ZM13 3v6h6M8 15h8M12 11v8"/>',
  erase:
    '<path d="m4 13 9-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3L11 21H7l-3-4a3 3 0 0 1 0-4ZM9 8l8 8M11 21h11"/>',
  left: '<path d="M17 20v-7a6 6 0 0 0-6-6H4m5-5L4 7l5 5"/>',
  right: '<path d="M7 20v-7a6 6 0 0 1 6-6h7m-5-5 5 5-5 5"/>',
  forward: '<path d="M12 21V3m-6 6 6-6 6 6"/>',
  switch: '<path d="M8 21V3M8 14c0-4 3-6 8-6h3m-3-3 3 3-3 3"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  focus:
    '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="3"/>',
  pointer: '<path d="m5 3 14 9-7 1-3 7Z"/>',
  play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>',
  eyeOff:
    '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 4.2A10.8 10.8 0 0 1 21 12a13 13 0 0 1-2.2 3.2M6.6 6.6A12.7 12.7 0 0 0 3 12s3.5 6 9 6c1.1 0 2.1-.2 3-.6"/>',
  save: '<path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ""}</svg>`;
document
  .querySelectorAll<HTMLElement>("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon!)));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const items: {
  kind: DecorationKind;
  name: string;
  category: "nature" | "buildings" | "park" | "train";
  color: string;
}[] = [
  { kind: "water", name: "Su", category: "nature", color: "blue" },
  { kind: "grassLight", name: "Açık çimen", category: "nature", color: "sage" },
  { kind: "grassDark", name: "Koyu çimen", category: "nature", color: "sage" },
  { kind: "tree", name: "Ağaç", category: "nature", color: "sage" },
  { kind: "pine", name: "Çam", category: "nature", color: "sage" },
  { kind: "treeSmall", name: "Küçük ağaç", category: "nature", color: "sage" },
  { kind: "blossom", name: "Çiçekli ağaç", category: "nature", color: "peach" },
  { kind: "grove", name: "Koru", category: "nature", color: "sage" },
  { kind: "pineForest", name: "Çam ormanı", category: "nature", color: "sage" },
  { kind: "autumnTrees", name: "Sonbahar ağaçları", category: "nature", color: "sun" },
  { kind: "orchard", name: "Meyve bahçesi", category: "nature", color: "peach" },
  { kind: "bushes", name: "Çalılar", category: "nature", color: "sage" },
  { kind: "flowers", name: "Çiçekler", category: "nature", color: "peach" },
  { kind: "rocks", name: "Kayalar", category: "nature", color: "stone" },
  { kind: "pond", name: "Gölet", category: "nature", color: "blue" },
  { kind: "waterfall", name: "Şelale", category: "nature", color: "blue" },
  { kind: "fountain", name: "Fıskiye", category: "nature", color: "blue" },
  { kind: "mountain", name: "Dağ", category: "nature", color: "stone" },
  { kind: "mountainSnow", name: "Karlı dağ", category: "nature", color: "stone" },
  { kind: "duck", name: "Ördekler", category: "nature", color: "sun" },
  { kind: "cow", name: "İnek", category: "nature", color: "sand" },
  { kind: "sheep", name: "Koyun", category: "nature", color: "sand" },
  { kind: "chicken", name: "Tavuklar", category: "nature", color: "sun" },
  { kind: "horses", name: "Atlar", category: "nature", color: "sand" },
  { kind: "goats", name: "Keçiler", category: "nature", color: "stone" },
  { kind: "deer", name: "Geyikler", category: "nature", color: "sage" },

  { kind: "roadAsphalt", name: "Asfalt yol", category: "buildings", color: "stone" },
  { kind: "roadDirt", name: "Toprak yol", category: "buildings", color: "sand" },
  { kind: "roadStone", name: "Taş yol", category: "buildings", color: "stone" },
  { kind: "house", name: "Ev", category: "buildings", color: "peach" },
  { kind: "houseBlue", name: "Mavi çatılı ev", category: "buildings", color: "blue" },
  { kind: "houseRed", name: "Kırmızı çatılı ev", category: "buildings", color: "peach" },
  { kind: "cottage", name: "Küçük ev", category: "buildings", color: "sand" },
  { kind: "apartment", name: "Apartman", category: "buildings", color: "stone" },
  { kind: "farmhouse", name: "Çiftlik evi", category: "buildings", color: "sand" },
  { kind: "smallFarm", name: "Küçük çiftlik", category: "buildings", color: "sage" },
  { kind: "market", name: "Market", category: "buildings", color: "sage" },
  { kind: "bakery", name: "Fırın", category: "buildings", color: "sun" },
  { kind: "cafe", name: "Kafe", category: "buildings", color: "peach" },
  { kind: "postOffice", name: "Postane", category: "buildings", color: "sun" },
  { kind: "library", name: "Kütüphane", category: "buildings", color: "peach" },
  { kind: "fireStation", name: "İtfaiye", category: "buildings", color: "peach" },
  { kind: "policeStation", name: "Polis merkezi", category: "buildings", color: "blue" },
  { kind: "hospital", name: "Hastane (haç)", category: "buildings", color: "stone" },
  { kind: "hospitalCrescent", name: "Hastane (hilal)", category: "buildings", color: "stone" },
  { kind: "school", name: "Okul", category: "buildings", color: "sun" },
  { kind: "mosque", name: "Cami", category: "buildings", color: "blue" },
  { kind: "cityHall", name: "Belediye binası", category: "buildings", color: "sand" },
  { kind: "tent", name: "Kamp", category: "buildings", color: "blue" },
  { kind: "windmill", name: "Yel değirmeni", category: "buildings", color: "sand" },

  { kind: "carousel", name: "Atlı karınca", category: "park", color: "sun" },
  { kind: "balloon", name: "Balon", category: "park", color: "sun" },
  { kind: "ferris", name: "Dönme dolap", category: "park", color: "peach" },
  { kind: "cake", name: "Pasta", category: "park", color: "peach" },
  { kind: "circus", name: "Eğlence çadırı", category: "park", color: "sun" },
  { kind: "icecream", name: "Dondurmacı", category: "park", color: "blue" },
  { kind: "funhouse", name: "Eğlence evi", category: "park", color: "peach" },
  { kind: "gift", name: "Hediye kutusu", category: "park", color: "sun" },
  { kind: "playground", name: "Oyun alanı", category: "park", color: "sage" },

  { kind: "stationSmall", name: "Küçük istasyon", category: "train", color: "sand" },
  { kind: "stationLarge", name: "Büyük istasyon", category: "train", color: "blue" },
  { kind: "stationCountry", name: "Kır istasyonu", category: "train", color: "peach" },
  { kind: "tunnelStone", name: "Taş tünel", category: "train", color: "stone" },
  { kind: "tunnelGreen", name: "Yeşil tünel", category: "train", color: "sage" },
  { kind: "levelCrossing", name: "Hemzemin geçit", category: "train", color: "sand" },
  { kind: "bufferStop", name: "Tampon", category: "train", color: "peach" },
];

$("decoration-grid").innerHTML = items
  .map((item) => {
    const hidden = item.category === "nature" ? "" : " hidden";
    const card = `<button class="decor-card ${item.color}" data-kind="${item.kind}" data-group="${item.category}" aria-label="${item.name} ekle" aria-pressed="false"${hidden}><img alt="" draggable="false"/></button>`;
    // Ground tiles (water and grass, or the roads) lead their panel on their
    // own row, ruled off from the rest.
    return item.kind === "grassDark" || item.kind === "roadStone"
      ? `${card}<hr class="decor-divider" data-group="${item.category}"${hidden}/>`
      : card;
  })
  .join("");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#a7c882",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true, pixelArt: false },
  input: { activePointers: 3 },
  scene: [WebTrainScene],
});
let scene: WebTrainScene;
type SidePanel = "nature" | "buildings" | "park" | "track" | "train";
let activePanel: SidePanel | null = "nature";

function setPanel(panel: SidePanel | null) {
  activePanel = panel;
  const grid = $("decoration-grid");
  const category =
    panel === "nature" ||
    panel === "buildings" ||
    panel === "park" ||
    panel === "train"
      ? panel
      : null;

  grid.hidden = category === null;
  grid.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) => {
    button.hidden = category === null || button.dataset.group !== category;
  });

  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
    const active = button.dataset.panel === panel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function togglePanel(panel: SidePanel) {
  setPanel(activePanel === panel ? null : panel);
}
setPanel("nature");

let speed = 1;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3400);
}
// Station panel (left): live view of the station, open/closed lights and
// how long trains wait there.
const stationPanel = $("station-panel");
const stationChip = $("station-chip");
let stationCell: Point | null = null;
let stationTimer = 0;
let stationCollapsed = false;
let stationEditing = false;

const sameCell = (a: Point | null, b: Point | null) =>
  Boolean(a && b && a.x === b.x && a.y === b.y);

function stationDefaultName(kind: DecorationKind) {
  return items.find((item) => item.kind === kind)?.name ?? "İstasyon";
}

function stationDisplayName() {
  if (!scene || !stationCell) return "İstasyon";
  const info = scene.stationInfo(stationCell);
  return info?.name || (info ? stationDefaultName(info.kind) : "İstasyon");
}

function setStationEditing(editing: boolean) {
  stationEditing = editing;
  const title = $("station-title");
  const input = $<HTMLInputElement>("station-name-input");
  const button = $<HTMLButtonElement>("rename-station");
  title.hidden = editing;
  input.hidden = !editing;
  button.innerHTML = icon(editing ? "check" : "edit");
  button.setAttribute(
    "aria-label",
    editing ? "İstasyon adını kaydet" : "İstasyon adını değiştir",
  );
  button.title = editing ? "Kaydet" : "Adını değiştir";
  if (editing) {
    input.value = stationDisplayName();
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
}

function startStationTimer() {
  clearInterval(stationTimer);
  if (!stationCell || stationCollapsed) return;
  stationTimer = window.setInterval(renderStation, 250);
}

function setStationCollapsed(collapsed: boolean) {
  if (!stationCell) return;
  stationCollapsed = collapsed;
  stationPanel.hidden = collapsed;
  stationChip.hidden = !collapsed;
  if (collapsed) {
    setStationEditing(false);
    clearInterval(stationTimer);
    scene?.setStationView(null);
    $("station-chip-name").textContent = stationDisplayName();
    restack();
  } else {
    stationChip.hidden = true;
    renderStation();
    raiseCard("station-slot");
    startStationTimer();
  }
}

function renderStation() {
  if (!scene || !stationCell) return;
  const info = scene.stationInfo(stationCell);
  if (!info) return;
  const name = info.name || stationDefaultName(info.kind);
  if (!stationEditing) $("station-title").textContent = name;
  $("station-chip-name").textContent = name;
  for (const [id, active] of [["station-open", !info.closed], ["station-closed", info.closed]] as const) {
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-pressed", String(active));
  }
  $("station-dwell-row").hidden = info.closed;
  $("dwell-value").textContent = `${info.dwell} sn`;
  $<HTMLButtonElement>("dwell-minus").disabled = info.dwell <= 1;
  $<HTMLButtonElement>("dwell-plus").disabled = info.dwell >= MAX_DWELL;
  $("station-status").textContent = info.closed
    ? ""
    : info.waiting
      ? `${info.remaining} sn`
      : `Trenler ${info.dwell} sn bekler`;
  $("station-status").classList.toggle("waiting", info.waiting);
}

// Station and train cards share a bottom-left stack. A card that opens
// goes on top; the views are re-measured whenever the stack shifts.
const infoStack = $("info-stack");
function raiseCard(slot: string) {
  infoStack.prepend($(slot));
  restack();
}
function restack() {
  requestAnimationFrame(() => {
    placeStationView();
    placeTrainView();
  });
}
infoStack.addEventListener("scroll", restack);

function placeStationView() {
  if (!scene || !stationCell || stationCollapsed || stationPanel.hidden) {
    scene?.setStationView(null);
    return;
  }
  const rect = $("station-view").getBoundingClientRect();
  scene.setStationView(
    rect.width ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
    $<HTMLCanvasElement>("station-canvas"),
  );
}
window.addEventListener("resize", () => requestAnimationFrame(placeStationView));

// Train panel (bottom left, in place of a station's): live view following
// the train, its wagons and cargo, direction, and moving it to another rail.
const trainPanel = $("train-panel");
const trainChip = $("train-chip");
let trainOpen = false;
let trainTimer = 0;
let trainCollapsed = false;
let trainEditing = false;
function setTrainEditing(editing: boolean) {
  trainEditing = editing;
  const input = $<HTMLInputElement>("train-name-input");
  const button = $<HTMLButtonElement>("rename-train");
  $("train-title").hidden = editing;
  input.hidden = !editing;
  button.innerHTML = icon(editing ? "check" : "edit");
  button.setAttribute("aria-label", editing ? "Trenin adını kaydet" : "Trenin adını değiştir");
  button.title = editing ? "Kaydet" : "Adını değiştir";
  if (editing) {
    input.value = scene.trainInfo().name;
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
}
// Hiding folds the card into a small chip with the train's name.
function setTrainCollapsed(collapsed: boolean) {
  if (!trainOpen) return;
  trainCollapsed = collapsed;
  trainPanel.hidden = collapsed;
  trainChip.hidden = !collapsed;
  if (collapsed) {
    setTrainEditing(false);
    scene.setTrainView(null);
    restack();
  } else {
    renderTrain();
    raiseCard("train-slot");
  }
}
function renderTrain() {
  if (!scene || !trainOpen) return;
  const library = document.querySelector(".library")!.getBoundingClientRect();
  scene.mapInsetRight = Math.max(0, window.innerWidth - library.left);
  const info = scene.trainInfo();
  if (!trainEditing) $("train-title").textContent = info.name;
  $("train-chip-name").textContent = info.name;
  $("follow-train").classList.toggle("active", scene.followingTrain);
  $("follow-train").setAttribute("aria-pressed", String(scene.followingTrain));
  trainChip.classList.toggle("following", scene.followingTrain);
  const stationName = info.station
    ? info.station.name || stationDefaultName(info.station.kind)
    : "";
  $("train-status").textContent = scene.placingTrain
    ? "Treni koymak istediğin raya dokun."
    : info.station
      ? `${stationName} istasyonunda · ${info.remaining} sn`
      : info.playing
        ? `Yolda · ${info.speed}× hız`
        : "Duruyor";
  $("train-status").classList.toggle("waiting", Boolean(info.station) || scene.placingTrain);
  $("wagons-value").textContent = String(info.wagons);
  $<HTMLButtonElement>("wagons-minus").disabled = info.wagons <= 0;
  $<HTMLButtonElement>("wagons-plus").disabled = info.wagons >= MAX_WAGONS;
  for (const [id, active] of [["cargo-passengers", info.cargo === "passengers"], ["cargo-freight", info.cargo === "freight"]] as const) {
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-pressed", String(active));
  }
  // The arrow points the way the train is heading on screen.
  $("train-arrow").style.transform = `rotate(${(info.angle * 180) / Math.PI + 90}deg)`;
  $("place-train").classList.toggle("active", scene.placingTrain);
  $("place-train").setAttribute("aria-pressed", String(scene.placingTrain));
}
function placeTrainView() {
  if (!scene || !trainOpen || trainCollapsed) return;
  const rect = $("train-view").getBoundingClientRect();
  scene.setTrainView(
    rect.width ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
    $<HTMLCanvasElement>("train-canvas"),
  );
}
window.addEventListener("resize", () => requestAnimationFrame(placeTrainView));

function refresh(status: GameStatus) {
  if (stationCell) renderStation();
  if (trainOpen) renderTrain();
  document.querySelectorAll<HTMLElement>("[data-kind]").forEach((el) => {
    const active = el.dataset.kind === status.tool;
    el.classList.toggle("selected", active);
    el.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
    const active = button.dataset.panel === activePanel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $<HTMLButtonElement>("undo").disabled = !status.canUndo;
  $<HTMLButtonElement>("redo").disabled = !status.canRedo;

  const roadMode = $("road-mode-panel");
  const roadActive = isRoadKind(status.tool);
  roadMode.hidden = !roadActive;
  if (roadActive) {
    const source = document.querySelector<HTMLImageElement>(
      `[data-kind="${status.tool}"] img`,
    )?.src;
    if (source) $<HTMLImageElement>("road-mode-image").src = source;
  }

  $("track-count").textContent = String(status.world.tracks.length);
  $("decor-count").textContent = String(status.world.decorations.length);
  $("zoom-label").textContent = `${Math.round(status.zoom * 100)}%`;
  const playLabel = status.playing ? "Treni durdur" : "Treni çalıştır";
  $("play").setAttribute("aria-label", playLabel);
  $("play").title = playLabel;
  $("play").firstElementChild!.innerHTML = icon(
    status.playing ? "pause" : "play",
  );
  $("play").classList.toggle("playing", status.playing);
  $("save-status").textContent = status.saved
    ? "Kaydedildi"
    : "Kayıt kullanılamıyor";

}

// Cards are drawn large and then cropped to what was painted, so every
// object fills its card whatever its size in the world.
const CARD_SCALE = 3;
function fitCard(source: HTMLCanvasElement) {
  const { width, height } = source;
  const pixels = source.getContext("2d")!.getImageData(0, 0, width, height).data;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] > 24) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) return source;
  const w = right - left + 1;
  const h = bottom - top + 1;
  const side = Math.ceil(Math.max(w, h) * 1.08);
  const card = document.createElement("canvas");
  card.width = card.height = side;
  card
    .getContext("2d")!
    .drawImage(source, left, top, w, h, (side - w) / 2, (side - h) / 2, w, h);
  return card;
}

// A world heading as a unit vector on screen.
const screenVector = (heading: number) => {
  const world = vectors[((heading % 4) + 4) % 4];
  const sx = (world.x - world.y) * 48;
  const sy = (world.x + world.y) * 24;
  const length = Math.hypot(sx, sy) || 1;
  return { x: sx / length, y: sy / length };
};

game.events.once("world-ready", (ready: WebTrainScene) => {
  scene = ready;
  scene.onChange = refresh;
  scene.onStation = (cell) => {
    const previous = stationCell;
    stationCell = cell;
    clearInterval(stationTimer);
    setStationEditing(false);

    if (!cell) {
      stationCollapsed = false;
      stationPanel.hidden = true;
      stationChip.hidden = true;
      scene.setStationView(null);
      restack();
      return;
    }

    // Selecting any station opens the full card. This also makes a second
    // tap on the same collapsed station restore it.
    stationCollapsed = false;
    stationPanel.hidden = false;
    stationChip.hidden = true;
    if (!sameCell(previous, cell)) scene.setStationView(null);
    renderStation();
    raiseCard("station-slot");
    startStationTimer();
  };
  scene.onTrain = (selected) => {
    // Tapping the train again restores a hidden card.
    const opened = selected && (!trainOpen || trainCollapsed);
    trainOpen = selected;
    if (opened) trainCollapsed = false;
    trainPanel.hidden = !selected || trainCollapsed;
    trainChip.hidden = !selected || !trainCollapsed;
    clearInterval(trainTimer);
    if (!selected) {
      trainCollapsed = false;
      setTrainEditing(false);
      if (scene.placingTrain) scene.setPlacingTrain(false);
      restack();
      return;
    }
    renderTrain();
    if (opened) raiseCard("train-slot");
    trainTimer = window.setInterval(renderTrain, 200);
  };
  scene.onMessage = toast;
  let previousRail = "";
  scene.onRailControls = (controls) => {
    const key = JSON.stringify([controls, window.innerWidth, window.innerHeight], (_k, v) =>
      typeof v === "number" ? Math.round(v) : v,
    );
    if (key === previousRail) return;
    previousRail = key;
    const panel = document.querySelector(".library")!.getBoundingClientRect();
    const right = panel.left - (window.innerWidth < 760 ? 8 : 12);
    const radius = window.innerWidth < 760 ? 62 : 76;
    const safe = radius + 14;
    const onMap = (x: number, y: number) =>
      x > 18 && x < right - 18 && y > 18 && y < window.innerHeight - 18;
    const place = (el: HTMLElement, x: number, y: number) => {
      const placed = {
        x: Phaser.Math.Clamp(x, safe, Math.max(safe, right - safe)),
        y: Phaser.Math.Clamp(y, safe, Math.max(safe, window.innerHeight - safe)),
      };
      el.style.left = `${placed.x}px`;
      el.style.top = `${placed.y}px`;
      return placed;
    };
    const angle = (v: { x: number; y: number }) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

    // Extending from a loose end: left, forward and right around the end.
    const actions = $("track-actions");
    const end = controls.end;
    actions.hidden = !end || !onMap(end.x, end.y);
    if (end && !actions.hidden) {
      const anchor = place(actions, end.x, end.y);
      const forward = screenVector(end.heading);
      const minimumArrowRadius = window.innerWidth < 760 ? 64 : 72;
      actions.querySelectorAll<HTMLButtonElement>("[data-turn]").forEach((button) => {
        const turn = Number(button.dataset.turn) as Turn;
        const direction = screenVector(end.heading + turn);
        const target = end.targets[turn + 1];
        const rawX = target.x - anchor.x;
        const rawY = target.y - anchor.y;
        const rawRadius = Math.hypot(rawX, rawY) || 1;

        // At close zoom levels the exact future edge midpoint is ideal.
        // When zoomed out those three edge midpoints collapse toward each
        // other on screen, so keep their real angles but push them outward
        // just enough to preserve a comfortable touch gap.
        const spread = Math.max(1, minimumArrowRadius / rawRadius);
        const offsetX = rawX * spread;
        const offsetY = rawY * spread;

        // Each SVG has a different native arrow-head direction.
        const nativeAngle = turn === -1 ? 180 : turn === 0 ? -90 : 0;
        button.style.setProperty("--turn-x", `${offsetX}px`);
        button.style.setProperty("--turn-y", `${offsetY}px`);
        button.style.setProperty("--turn-rotation", `${angle(direction) - nativeAngle}deg`);
        button.disabled = !end.can[turn + 1];
      });
      // Delete stays behind the current endpoint, separate from the three
      // future-edge choices.
      const remove = $<HTMLButtonElement>("remove-track");
      remove.hidden = !end.remove;
      remove.style.setProperty("--delete-x", `${-forward.x * radius * 0.82}px`);
      remove.style.setProperty("--delete-y", `${-forward.y * radius * 0.82}px`);
    }

    // Branching a straight rail: four diagonal arrows around the piece.
    const branchActions = $("branch-actions");
    const branch = controls.branch;
    branchActions.hidden = !branch || !onMap(branch.x, branch.y);
    if (branch && !branchActions.hidden) {
      place(branchActions, branch.x, branch.y);
      branchActions.querySelectorAll<HTMLButtonElement>("[data-branch]").forEach((button) => {
        const kind = button.dataset.branch as BranchKind;
        // Same geometry as the model: travel one way, then turn off to a side.
        const travel = branch.heading + (kind.startsWith("back") ? 2 : 0);
        const along = screenVector(travel);
        const side = screenVector(travel + (kind.endsWith("Right") ? 1 : 3));
        const raw = { x: along.x + side.x, y: along.y + side.y };
        const length = Math.hypot(raw.x, raw.y) || 1;
        const direction = { x: raw.x / length, y: raw.y / length };
        button.style.setProperty("--turn-x", `${direction.x * radius * 0.9}px`);
        button.style.setProperty("--turn-y", `${direction.y * radius * 0.9}px`);
        button.style.setProperty("--turn-rotation", `${angle(direction) + 90}deg`);
        // Blocked directions stay clickable so the game can say why.
        button.classList.toggle("blocked", !branch.can[kind]);
        button.setAttribute("aria-disabled", String(!branch.can[kind]));
      });
    }

    // A switch shows a button that flips which way trains go.
    const toggle = $<HTMLButtonElement>("switch-toggle");
    const sw = controls.toggle;
    toggle.hidden = !sw || !onMap(sw.x, sw.y);
    if (sw && !toggle.hidden) {
      toggle.style.left = `${sw.x}px`;
      toggle.style.top = `${sw.y}px`;
      toggle.classList.toggle("thrown", sw.thrown);
      toggle.setAttribute(
        "aria-label",
        sw.thrown ? "Makası düz yola çevir" : "Makası yan yola çevir",
      );
    }
  };
  let previousDecorationAnchor = "";
  scene.onDecorationAnchor = (x, y, visible) => {
    const key = `${Math.round(x)},${Math.round(y)},${visible}`;
    if (key === previousDecorationAnchor) return;
    previousDecorationAnchor = key;
    const button = $<HTMLButtonElement>("delete-selected");
    button.hidden = !visible;
    if (!visible) return;
    const panelLeft =
      document.querySelector(".library")?.getBoundingClientRect().left ??
      window.innerWidth;
    const clampedX = Math.max(34, Math.min(panelLeft - 34, x));
    const clampedY = Math.max(34, Math.min(window.innerHeight - 34, y));
    button.style.left = `${clampedX}px`;
    button.style.top = `${clampedY}px`;
  };

  const expandButtons = new Map<string, HTMLButtonElement>();
  scene.onExpansionAnchors = (anchors) => {
    const container = $("expand-controls");
    const activeKeys = new Set(
      anchors.map(({ chunk, edge }) => `${chunk.x},${chunk.y},${edge}`),
    );

    for (const [key, button] of expandButtons) {
      if (!activeKeys.has(key)) {
        button.remove();
        expandButtons.delete(key);
      }
    }

    const panelLeft =
      document.querySelector(".library")?.getBoundingClientRect().left ??
      window.innerWidth;

    for (const anchor of anchors) {
      const key = `${anchor.chunk.x},${anchor.chunk.y},${anchor.edge}`;
      let button = expandButtons.get(key);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "expand-edge";
        button.innerHTML = icon("forward");
        button.setAttribute("aria-label", "Haritayı bu yönde genişlet");
        button.onclick = () => {
          pendingExpansion = {
            chunk: { ...anchor.chunk },
            edge: anchor.edge,
          };
          expand.showModal();
        };
        container.appendChild(button);
        expandButtons.set(key, button);
      }

      button.hidden = !anchor.visible || anchor.x > panelLeft - 22;
      button.style.left = `${anchor.x}px`;
      button.style.top = `${anchor.y}px`;
      button.style.setProperty(
        "--expand-rotation",
        `${anchor.rotation + 90}deg`,
      );
    }
  };

  for (const item of items) {
    const g = scene.add.graphics();
    g.save().scaleCanvas(CARD_SCALE, CARD_SCALE).translateCanvas(70, 125);
    decoration(g, item.kind);
    g.restore();
    const key = `card-${item.kind}`;
    g.generateTexture(key, 140 * CARD_SCALE, 160 * CARD_SCALE);
    g.destroy();
    const canvas = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    document.querySelector<HTMLImageElement>(
      `[data-kind="${item.kind}"] img`,
    )!.src = fitCard(canvas).toDataURL();
    scene.textures.remove(key);
  }
  scene.emit();
});
type DeleteTarget = "track" | "decoration";
let pendingDelete: DeleteTarget | null = null;
const requestDelete = (target: DeleteTarget) => {
  pendingDelete = target;
  $<HTMLDialogElement>("delete-dialog").showModal();
};

const bind = (id: string, fn: () => void) =>
  $(id).addEventListener("click", () => {
    if (scene) fn();
  });

bind("panel-nature", () => {
  togglePanel("nature");
  scene.setTool("select");
});
bind("panel-home", () => {
  togglePanel("buildings");
  scene.setTool("select");
});
bind("panel-park", () => {
  togglePanel("park");
  scene.setTool("select");
});
bind("track-tool", () => {
  if (activePanel === "track") {
    setPanel(null);
    scene.setTool("select");
  } else {
    setPanel("track");
    scene.setTool("track");
  }
});
bind("train-tool", () => {
  togglePanel("train");
  scene.setTool("select");
});
bind("play", () => scene.setPlaying());
bind("speed", () => {
  speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
  scene.setSpeed(speed);
  $("speed").textContent = `${speed}×`;
  $("speed").setAttribute("aria-label", `Tren hızı: ${speed} kat`);
});
bind("undo", () => scene.undo());
bind("redo", () => scene.redo());
bind("remove-track", () => requestDelete("track"));
bind("delete-selected", () => requestDelete("decoration"));
bind("home", () => scene.home());
bind("zoom-in", () => scene.zoom(1.15));
bind("zoom-out", () => scene.zoom(1 / 1.15));
bind("road-mode-toggle", () => scene.setTool("select"));

document
  .querySelectorAll<HTMLButtonElement>("[data-turn]")
  .forEach((button) => {
    const turn = Number(button.dataset.turn) as Turn;
    button.onclick = () => scene?.extend(turn);
    button.onpointerenter = () => scene?.previewTurn(turn);
    button.onpointerleave = () => scene?.previewTurn(null);
    button.onfocus = () => scene?.previewTurn(turn);
    button.onblur = () => scene?.previewTurn(null);
  });

document
  .querySelectorAll<HTMLButtonElement>("[data-branch]")
  .forEach((button) => {
    const kind = button.dataset.branch as BranchKind;
    button.onclick = () => scene?.branch(kind);
    button.onpointerenter = () => scene?.previewBranch(kind);
    button.onpointerleave = () => scene?.previewBranch(null);
    button.onfocus = () => scene?.previewBranch(kind);
    button.onblur = () => scene?.previewBranch(null);
  });
bind("switch-toggle", () => scene.toggleSelectedSwitch());
bind("close-station", () => scene.selectStation(null));
bind("close-train", () => scene.selectTrain(false));
bind("hide-train", () => setTrainCollapsed(true));
bind("train-chip", () => setTrainCollapsed(false));
bind("follow-train", () => scene.setFollowingTrain(!scene.followingTrain));
bind("rename-train", () => {
  if (!trainEditing) {
    setTrainEditing(true);
    return;
  }
  scene.setTrainSettings({ name: $<HTMLInputElement>("train-name-input").value });
  setTrainEditing(false);
  renderTrain();
});
$<HTMLInputElement>("train-name-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $<HTMLButtonElement>("rename-train").click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    setTrainEditing(false);
  }
});
const stepWagons = (by: number) =>
  scene.setTrainSettings({ wagons: scene.trainInfo().wagons + by });
bind("wagons-minus", () => stepWagons(-1));
bind("wagons-plus", () => stepWagons(1));
bind("cargo-passengers", () => scene.setTrainSettings({ cargo: "passengers" }));
bind("cargo-freight", () => scene.setTrainSettings({ cargo: "freight" }));
bind("reverse-train", () => scene.reverseTrain());
bind("place-train", () => scene.setPlacingTrain(!scene.placingTrain));
bind("hide-station", () => setStationCollapsed(true));
bind("station-chip", () => setStationCollapsed(false));
bind("rename-station", () => {
  if (!stationCell) return;
  if (!stationEditing) {
    setStationEditing(true);
    return;
  }
  const value = $<HTMLInputElement>("station-name-input").value;
  scene.setStationSettings({ name: value });
  setStationEditing(false);
  renderStation();
});
$<HTMLInputElement>("station-name-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $<HTMLButtonElement>("rename-station").click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    setStationEditing(false);
  }
});
bind("station-open", () => scene.setStationSettings({ closed: false }));
bind("station-closed", () => scene.setStationSettings({ closed: true }));
const stepDwell = (by: number) => {
  const info = stationCell && scene.stationInfo(stationCell);
  if (info) scene.setStationSettings({ dwell: info.dwell + by });
};
bind("dwell-minus", () => stepDwell(-1));
bind("dwell-plus", () => stepDwell(1));

document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach(
  (button) =>
    (button.onclick = () => {
      const kind = button.dataset.kind as DecorationKind;
      scene?.setTool(kind);
    }),
);

const help = $<HTMLDialogElement>("help-dialog"),
  gameDialog = $<HTMLDialogElement>("game-dialog"),
  expand = $<HTMLDialogElement>("expand-dialog"),
  deleteDialog = $<HTMLDialogElement>("delete-dialog");
let pendingExpansion: { chunk: Chunk; edge: ChunkEdge } | null = null;
$("help-button").onclick = () => help.showModal();
help
  .querySelectorAll<HTMLButtonElement>("button")
  .forEach((b) => (b.onclick = () => help.close()));

// Game menu: new game, named saves in this browser, and JSON export/import.
type GameAction = "new" | "save" | "open" | "export" | "import";
let currentName = "";
const gameStatus = (text: string, error = false) => {
  const el = $("game-status");
  el.textContent = text;
  el.classList.toggle("error", error);
};
const defaultName = () => currentName || `Dünyam ${listSaves(localStorage).length + 1}`;
const showGameAction = (action: GameAction | null) => {
  gameStatus("");
  gameDialog.querySelectorAll<HTMLButtonElement>("[data-game]").forEach((b) => {
    const active = b.dataset.game === action;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  gameDialog.querySelectorAll<HTMLElement>("[data-panel-for]").forEach((panel) => {
    panel.hidden = panel.dataset.panelFor !== action;
  });
  if (action === "save" || action === "export") {
    const input = $<HTMLInputElement>(action === "save" ? "save-name" : "export-name");
    input.value = defaultName();
    input.select();
    input.focus();
  }
  if (action === "open") renderSaves();
};
const formatDate = (time: number) =>
  new Date(time).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
function renderSaves() {
  const list = $("save-list");
  const saves = listSaves(localStorage);
  $("save-empty").hidden = saves.length > 0;
  list.innerHTML = "";
  for (const save of saves) {
    const item = document.createElement("li");
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = save.name;
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(save.savedAt)} · ${save.world.tracks.length} ray · ${save.world.decorations.length} dekor`;
    info.append(name, meta);
    const open = document.createElement("button");
    open.className = "primary";
    open.textContent = "Aç";
    open.onclick = () => {
      scene?.loadWorld(save.world);
      currentName = save.name;
      gameDialog.close();
      toast(`“${save.name}” açıldı.`);
    };
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.setAttribute("aria-label", `“${save.name}” kaydını sil`);
    remove.title = "Kaydı sil";
    remove.innerHTML = icon("trash");
    remove.onclick = () => {
      if (!confirm(`“${save.name}” kaydı silinsin mi?`)) return;
      deleteSave(localStorage, save.id);
      renderSaves();
    };
    item.append(info, open, remove);
    list.append(item);
  }
}
$("game-menu").onclick = () => {
  showGameAction(null);
  gameDialog.showModal();
};
$("close-game").onclick = () => gameDialog.close();
gameDialog.addEventListener("click", (event) => {
  if (event.target === gameDialog) gameDialog.close();
});
gameDialog.querySelectorAll<HTMLButtonElement>("[data-game]").forEach((button) => {
  button.onclick = () => showGameAction(button.dataset.game as GameAction);
});
$("confirm-new").onclick = () => {
  scene?.reset();
  currentName = "";
  gameDialog.close();
  toast("Yeni bir dünya, yeni bir hikâye.");
};
$("confirm-save").onclick = () => {
  if (!scene) return;
  try {
    const entry = writeSave(localStorage, $<HTMLInputElement>("save-name").value, scene.world);
    currentName = entry.name;
    gameDialog.close();
    toast(`“${entry.name}” kaydedildi.`);
  } catch {
    gameStatus("Kaydedilemedi: tarayıcı depolaması dolu ya da kapalı. Dışa aktarmayı dene.", true);
  }
};
$("confirm-export").onclick = () => {
  if (!scene) return;
  const name = $<HTMLInputElement>("export-name").value || defaultName();
  const blob = new Blob([exportWorld(scene.world, name)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = exportFileName(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  gameStatus(`${link.download} indirildi.`);
};
$("choose-import").onclick = () => $<HTMLInputElement>("import-file").click();
$<HTMLInputElement>("import-file").onchange = async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !scene) return;
  const loaded = importWorld(await file.text());
  if (!loaded) {
    gameStatus("Bu dosya bir WebTrain dünyası değil ya da bozuk.", true);
    return;
  }
  scene.loadWorld(loaded.world);
  currentName = loaded.name || file.name.replace(/\.json$/i, "");
  gameDialog.close();
  toast(`“${currentName}” içe aktarıldı.`);
};
const cancelExpansion = () => {
  pendingExpansion = null;
  if (expand.open) expand.close();
};
$("cancel-expand").onclick = cancelExpansion;
$("confirm-expand").onclick = () => {
  if (scene && pendingExpansion) {
    scene.expandWorld(pendingExpansion.chunk, pendingExpansion.edge);
    toast("Yeni 24 × 24 alan açıldı.");
  }
  pendingExpansion = null;
  expand.close();
};
expand.addEventListener("click", (event) => {
  // Native dialog backdrop clicks target the dialog element itself.
  if (event.target === expand) cancelExpansion();
});
expand.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelExpansion();
});

const cancelDeletion = () => {
  pendingDelete = null;
  if (deleteDialog.open) deleteDialog.close();
};
$("cancel-delete").onclick = cancelDeletion;
$("confirm-delete").onclick = () => {
  if (scene && pendingDelete === "track") scene.removeSelectedTrack();
  else if (scene && pendingDelete === "decoration")
    scene.deleteSelectedDecoration();

  pendingDelete = null;
  deleteDialog.close();
};
deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) cancelDeletion();
});
deleteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelDeletion();
});
window.addEventListener("keydown", (e) => {
  if (
    !scene ||
    help.open ||
    gameDialog.open ||
    expand.open ||
    deleteDialog.open ||
    (e.target instanceof HTMLElement &&
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
  )
    return;
  if (e.key === "Escape" && scene.placingTrain) {
    scene.setPlacingTrain(false);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? scene.redo() : scene.undo();
  } else if (e.code === "Space") {
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    scene.setPlaying();
  } else if (e.key === "1") {
    setPanel("track");
    scene.setTool("track");
  } else if (e.key === "2") {
    setPanel("nature");
    scene.setTool("select");
  } else if (e.key.toLowerCase() === "e") {
    scene.setTool("erase");
  } else if (e.key === "Escape") {
    setPanel(null);
    scene.setTool("select");
  }
});
