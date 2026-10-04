import Phaser from "phaser";
import "./style.css";
import { WebTrainScene, type GameStatus } from "./scenes/WebTrainScene";
import { decoration } from "./game/art";
import { candidate, vectors, type DecorationKind, type Turn } from "./game/model";
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
  category: "nature" | "buildings" | "park" | "train";
  color: string;
}[] = [
  { kind: "tree", name: "Ağaç", category: "nature", color: "sage" },
  { kind: "pine", name: "Çam", category: "nature", color: "sage" },
  { kind: "treeSmall", name: "Küçük ağaç", category: "nature", color: "sage" },
  { kind: "blossom", name: "Çiçekli ağaç", category: "nature", color: "peach" },
  { kind: "flowers", name: "Çiçekler", category: "nature", color: "peach" },
  { kind: "pond", name: "Gölet", category: "nature", color: "blue" },
  { kind: "water", name: "Su", category: "nature", color: "blue" },
  { kind: "waterfall", name: "Şelale", category: "nature", color: "blue" },
  { kind: "fountain", name: "Fıskiye", category: "nature", color: "blue" },
  { kind: "mountain", name: "Dağ", category: "nature", color: "stone" },
  { kind: "mountainSnow", name: "Karlı dağ", category: "nature", color: "stone" },
  { kind: "duck", name: "Ördekler", category: "nature", color: "sun" },
  { kind: "cow", name: "İnek", category: "nature", color: "sand" },
  { kind: "sheep", name: "Koyun", category: "nature", color: "sand" },
  { kind: "chicken", name: "Tavuklar", category: "nature", color: "sun" },

  { kind: "house", name: "Ev", category: "buildings", color: "peach" },
  { kind: "houseBlue", name: "Mavi çatılı ev", category: "buildings", color: "blue" },
  { kind: "houseRed", name: "Kırmızı çatılı ev", category: "buildings", color: "peach" },
  { kind: "cottage", name: "Küçük ev", category: "buildings", color: "sand" },
  { kind: "farmhouse", name: "Çiftlik evi", category: "buildings", color: "sand" },
  { kind: "tent", name: "Çadır", category: "buildings", color: "blue" },
  { kind: "windmill", name: "Yel değirmeni", category: "buildings", color: "sand" },
  { kind: "carousel", name: "Atlı karınca", category: "buildings", color: "sun" },

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

}

game.events.once("world-ready", (ready: WebTrainScene) => {
  scene = ready;
  scene.onChange = refresh;
  scene.onMessage = toast;
  let previousAnchor = "";
  scene.onAnchor = (x, y, visible, _blocked) => {
    const lastTrack = scene.world.tracks.at(-1)!;
    const heading = lastTrack.exit;
    const panel = document.querySelector(".library")!.getBoundingClientRect();
    const right = panel.left - (window.innerWidth < 760 ? 8 : 12);
    const radius = window.innerWidth < 760 ? 62 : 76;
    const safe = radius + 14;
    const anchor = `${Math.round(x)},${Math.round(y)},${visible},${heading},${Math.round(right)},${window.innerWidth},${window.innerHeight}`;
    if (anchor === previousAnchor) return;
    previousAnchor = anchor;

    const el = $("track-actions");
    const shown =
      visible &&
      x > 18 &&
      x < right - 18 &&
      y > 18 &&
      y < window.innerHeight - 18;
    el.hidden = !shown;
    if (!shown) return;

    const centerX = Phaser.Math.Clamp(x, safe, Math.max(safe, right - safe));
    const centerY = Phaser.Math.Clamp(
      y,
      safe,
      Math.max(safe, window.innerHeight - safe),
    );
    el.style.left = `${centerX}px`;
    el.style.top = `${centerY}px`;

    const screenVector = (targetHeading: number) => {
      const world = vectors[targetHeading];
      const sx = (world.x - world.y) * 48;
      const sy = (world.x + world.y) * 24;
      const length = Math.hypot(sx, sy) || 1;
      return { x: sx / length, y: sy / length };
    };

    const forward = screenVector(heading);

    el.querySelectorAll<HTMLButtonElement>("[data-turn]").forEach((button) => {
      const turn = Number(button.dataset.turn) as Turn;
      const targetHeading = (heading + turn + 4) % 4;
      const direction = screenVector(targetHeading);
      const targetAngle =
        (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
      // Each SVG has a different native arrow-head direction.
      const nativeAngle = turn === -1 ? 180 : turn === 0 ? -90 : 0;
      const rotation = targetAngle - nativeAngle;

      button.style.setProperty("--turn-x", `${direction.x * radius}px`);
      button.style.setProperty("--turn-y", `${direction.y * radius}px`);
      button.style.setProperty("--turn-rotation", `${rotation}deg`);
      button.disabled = !candidate(scene.world, turn);
    });

    // Delete sits behind the endpoint, away from all three possible new tracks.
    const remove = $<HTMLButtonElement>("remove-track");
    remove.style.setProperty("--delete-x", `${-forward.x * radius * 0.82}px`);
    remove.style.setProperty("--delete-y", `${-forward.y * radius * 0.82}px`);
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
  const closing = activePanel === "nature";
  togglePanel("nature");
  scene.setTool("select");
  if (!closing) scene.setTool("select");
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
bind("remove-track", () => scene.removeLast());
bind("delete-selected", () => scene.deleteSelectedDecoration());
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
