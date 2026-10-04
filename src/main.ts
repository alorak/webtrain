import Phaser from "phaser";
import "./style.css";
import { WebTrainScene, type GameStatus } from "./scenes/WebTrainScene";
import { decoration } from "./game/art";
import { vectors, type DecorationKind, type Turn } from "./game/model";
const paths: Record<string, string> = {
  train:
    '<rect x="4" y="8" width="14" height="10" rx="3"/><path d="M7 8V4h7v4M18 11h3v7H3M7 21h.01M16 21h.01M8 12h5"/>',
  track: '<path d="m7 3-3 18M17 3l3 18M6 7h12M5 12h14M4 18h16"/>',
  tree: '<path d="m12 2-7 9h3l-5 7h18l-5-7h3L12 2ZM12 18v4"/>',
  house: '<path d="M3 11 12 3l9 8v10h-6v-6H9v6H3Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 17h.01"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12"/>',
  new: '<path d="M13 3H5v18h14V9ZM13 3v6h6M8 15h8M12 11v8"/>',
  erase:
    '<path d="m4 13 9-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3L11 21H7l-3-4a3 3 0 0 1 0-4ZM9 8l8 8M11 21h11"/>',
  left: '<path d="M17 20v-7a6 6 0 0 0-6-6H4m5-5L4 7l5 5"/>',
  right: '<path d="M7 20v-7a6 6 0 0 1 6-6h7m-5-5 5 5-5 5"/>',
  forward: '<path d="M12 21V3m-6 6 6-6 6 6"/>',
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
  category: "nature" | "buildings";
  color: string;
}[] = [
  { kind: "tree", name: "Ağaç", category: "nature", color: "sage" },
  { kind: "duck", name: "Hayvan", category: "nature", color: "sun" },
  { kind: "house", name: "Ev", category: "buildings", color: "peach" },
];
$("decoration-grid").innerHTML = items
  .map((item) => {
    const hidden = item.category === "nature" ? "" : " hidden";
    return `<button class="decor-card ${item.color}" data-kind="${item.kind}" data-group="${item.category}" aria-label="${item.name} ekle" aria-pressed="false"${hidden}><img alt="" draggable="false"/></button>`;
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
let lastDecoration: DecorationKind = "tree";
type SidePanel = "nature" | "buildings" | "track" | "train";
let activePanel: SidePanel = "nature";

function showPanel(panel: SidePanel) {
  activePanel = panel;
  const category =
    panel === "nature" ? "nature" : panel === "buildings" ? "buildings" : null;
  const grid = $("decoration-grid");
  grid.hidden = category === null;
  grid.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) => {
    button.hidden = category !== null && button.dataset.group !== category;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
    const active = button.dataset.panel === panel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
let speed = 1;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3400);
}
function refresh(status: GameStatus) {
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
  $("train-tool").classList.toggle("playing", status.playing);
  $<HTMLButtonElement>("undo").disabled = !status.canUndo;
  $<HTMLButtonElement>("redo").disabled = !status.canRedo;
  $("track-count").textContent = String(status.world.tracks.length);
  $("decor-count").textContent = String(status.world.decorations.length);
  $("zoom-label").textContent = `${Math.round(status.zoom * 100)}%`;
  $("play-label").textContent = status.playing
    ? "Duraklat"
    : "Treni çalıştır";
  $("play").firstElementChild!.innerHTML = icon(
    status.playing ? "pause" : "play",
  );
  $("play").classList.toggle("playing", status.playing);
  $("save-status").textContent = status.saved
    ? "Kaydedildi"
    : "Kayıt kullanılamıyor";
  const heading = vectors[status.world.tracks.at(-1)!.exit];
  const angle =
    (Math.atan2(heading.x + heading.y, (heading.x - heading.y) * 2) * 180) /
      Math.PI +
    90;
  document
    .querySelectorAll<SVGElement>("[data-turn] svg")
    .forEach((svg) => (svg.style.transform = `rotate(${angle}deg)`));
}

game.events.once("world-ready", (ready: WebTrainScene) => {
  scene = ready;
  scene.onChange = refresh;
  scene.onMessage = toast;
  let previousAnchor = "";
  scene.onAnchor = (x, y, visible, blocked) => {
    const anchor = `${x},${y},${visible},${blocked},${window.innerWidth},${window.innerHeight}`;
    if (anchor === previousAnchor) return;
    previousAnchor = anchor;
    const el = $("track-actions");
    const panel = document.querySelector(".library")!.getBoundingClientRect();
    const right = window.innerWidth < 760 ? panel.left - 8 : panel.left - 16;
    const shown =
      visible &&
      x > 45 &&
      x < right &&
      y > 55 &&
      y <
        window.innerHeight -
          (window.innerWidth < 760 ? 70 : window.innerHeight < 550 ? 65 : 70);
    el.hidden = !shown;
    const center = Math.max(98, Math.min(right - 92, x));
    el.style.left = `${center}px`;
    el.style.setProperty("--anchor-offset", `${x - center}px`);
    el.style.top = `${Math.max(88, y)}px`;
    el.style.setProperty("--anchor-y-offset", `${y - Math.max(88, y)}px`);
    el.querySelector(".endpoint-label")!.textContent = blocked
      ? "YER YOK · SON RAYI SİLİP YÖN DEĞİŞTİR"
      : "YOLUN BURADAN DEVAM ETSİN";
    el.querySelectorAll<HTMLButtonElement>("[data-turn]").forEach(
      (b) => (b.disabled = blocked),
    );
  };
  for (const item of items) {
    const g = scene.add.graphics();
    g.save().translateCanvas(48, 104);
    decoration(g, item.kind);
    g.restore();
    g.generateTexture(`card-${item.kind}`, 96, 120);
    g.destroy();
    const canvas = scene.textures
      .get(`card-${item.kind}`)
      .getSourceImage() as HTMLCanvasElement;
    document.querySelector<HTMLImageElement>(
      `[data-kind="${item.kind}"] img`,
    )!.src = canvas.toDataURL();
  }
  scene.emit();
});
const bind = (id: string, fn: () => void) =>
  $(id).addEventListener("click", () => {
    if (scene) fn();
  });
bind("panel-nature", () => {
  showPanel("nature");
  lastDecoration = "tree";
  scene.setTool("tree");
});
bind("panel-home", () => {
  showPanel("buildings");
  lastDecoration = "house";
  scene.setTool("house");
});
bind("track-tool", () => {
  showPanel("track");
  scene.setTool("track");
});
bind("train-tool", () => {
  showPanel("train");
  scene.setPlaying();
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
bind("remove-track", () => scene.removeLast());
bind("home", () => scene.home());
bind("zoom-in", () => scene.zoom(1.15));
bind("zoom-out", () => scene.zoom(1 / 1.15));
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
document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach(
  (button) =>
    (button.onclick = () => {
      const kind = button.dataset.kind as DecorationKind;
      const panel = button.dataset.group as "nature" | "buildings";
      lastDecoration = kind;
      showPanel(panel);
      scene?.setTool(kind);
    }),
);

const help = $<HTMLDialogElement>("help-dialog"),
  reset = $<HTMLDialogElement>("reset-dialog");
$("help-button").onclick = () => help.showModal();
help
  .querySelectorAll<HTMLButtonElement>("button")
  .forEach((b) => (b.onclick = () => help.close()));
$("reset").onclick = () => reset.showModal();
$("cancel-reset").onclick = () => reset.close();
$("confirm-reset").onclick = () => {
  scene?.reset();
  reset.close();
  toast("Yeni bir dünya, yeni bir hikâye.");
};
window.addEventListener("keydown", (e) => {
  if (
    !scene ||
    help.open ||
    reset.open ||
    (e.target instanceof HTMLElement &&
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? scene.redo() : scene.undo();
  } else if (e.code === "Space") {
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    scene.setPlaying();
  } else if (e.key === "1") scene.setTool("track");
  else if (e.key === "2") scene.setTool(lastDecoration);
  else if (e.key.toLowerCase() === "e") scene.setTool("erase");
  else if (e.key === "Escape") scene.setTool("track");
});
