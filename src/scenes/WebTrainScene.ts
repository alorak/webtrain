import Phaser from "phaser";
import {
  appendTrack,
  candidate,
  CHUNK_SIZE,
  createWorld,
  expandChunk,
  exposedChunkEdges,
  inside,
  isTrackOverlayKind,
  neighboringChunk,
  nextCell,
  parseWorld,
  placeDecoration,
  same,
  sampleRoute,
  sampleTrack,
  STORAGE_KEY,
  trackLength,
  type Chunk,
  type ChunkEdge,
  type Point,
  type Tool,
  type Turn,
  type World,
} from "../game/model";
import {
  decoration,
  diamond,
  drawTrack,
  ground,
  locomotive,
  project,
  trackDecoration,
  unproject,
  waterTile,
} from "../game/art";

export interface ExpansionAnchor {
  chunk: Chunk;
  edge: ChunkEdge;
  x: number;
  y: number;
  rotation: number;
  visible: boolean;
}

export interface GameStatus {
  world: World;
  tool: Tool;
  playing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saved: boolean;
  zoom: number;
}
export class WebTrainScene extends Phaser.Scene {
  world: World = createWorld();
  tool: Tool = "track";
  playing = false;
  selected = true;
  saved = true;
  private history: string[] = [];
  private future: string[] = [];
  private scenery: Phaser.GameObjects.Graphics[] = [];
  private selectedDecorationIndex: number | null = null;
  private floor!: Phaser.GameObjects.Graphics;
  private rails!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private train!: Phaser.GameObjects.Graphics;
  private carriage!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;
  private drag: {
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null = null;
  private pinch = 0;
  private distance = 0.8;
  private travelDirection = 1;
  private speed = 1;
  onChange?: (status: GameStatus) => void;
  onMessage?: (message: string) => void;
  onAnchor?: (x: number, y: number, visible: boolean, blocked: boolean) => void;
  onDecorationAnchor?: (x: number, y: number, visible: boolean) => void;
  onExpansionAnchors?: (anchors: ExpansionAnchor[]) => void;

  constructor() {
    super("WebTrainScene");
  }
  create() {
    try {
      this.world =
        parseWorld(localStorage.getItem(STORAGE_KEY)) ?? createWorld();
    } catch {
      this.saved = false;
    }
    this.floor = this.add.graphics().setDepth(0);
    ground(this.floor, this.world.chunks);
    this.rails = this.add.graphics().setDepth(1);
    this.marker = this.add.graphics().setDepth(2);
    this.preview = this.add.graphics().setDepth(2000);
    this.train = this.add.graphics();
    this.carriage = this.add.graphics();
    this.drawWorld();
    this.home();
    this.configureInput();
    this.scale.on("resize", this.resize, this);
    this.events.once("shutdown", () =>
      this.scale.off("resize", this.resize, this),
    );
    this.game.events.emit("world-ready", this);
  }
  private resize() {
    this.preview.clear();
    this.home();
  }
  emit() {
    this.onChange?.({
      world: this.world,
      tool: this.tool,
      playing: this.playing,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      saved: this.saved,
      zoom: this.cameras.main.zoom,
    });
  }
  private remember() {
    this.history.push(JSON.stringify(this.world));
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }
  private commit() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.world));
      this.saved = true;
    } catch {
      this.saved = false;
    }
    this.distance = Math.min(this.distance, this.routeLength() - 0.05);
    this.preview.clear();
    this.drawWorld();
    this.emit();
  }
  setTool(tool: Tool) {
    this.tool = tool;
    this.selected = tool === "track";
    this.selectedDecorationIndex = null;
    this.preview.clear();
    this.emit();
  }
  setPlaying() {
    this.playing = !this.playing;
    this.emit();
  }
  setSpeed(speed: number) {
    this.speed = speed;
  }
  extend(turn: Turn) {
    if (!candidate(this.world, turn)) {
      this.onMessage?.("Burada yer yok. Son rayı silip başka bir yöne dön.");
      return;
    }
    this.remember();
    appendTrack(this.world, turn);
    this.selected = true;
    this.commit();
    if (this.world.closed)
      this.onMessage?.("Harika! Kapalı bir rota yaptın. Treni çalıştır.");
  }
  removeLast() {
    if (this.world.tracks.length <= 1) {
      this.onMessage?.(
        "Başlangıç rayı burada kalsın. Buradan yeni bir yol yapabilirsin.",
      );
      return;
    }
    this.remember();
    const removed = this.world.tracks.pop()!;
    this.world.decorations = this.world.decorations.filter(
      (d) => !(same(d, removed) && isTrackOverlayKind(d.kind)),
    );
    this.world.closed = false;
    this.selected = true;
    this.commit();
  }
  deleteSelectedDecoration() {
    const index = this.selectedDecorationIndex;
    if (index === null || !this.world.decorations[index]) return;
    this.remember();
    this.world.decorations.splice(index, 1);
    this.selectedDecorationIndex = null;
    this.tool = "select";
    this.commit();
  }
  expandWorld(chunk: Chunk, edge: ChunkEdge) {
    this.remember();
    if (!expandChunk(this.world, chunk, edge)) {
      this.history.pop();
      return;
    }
    this.selectedDecorationIndex = null;
    this.commit();
    this.home();
  }
  undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(JSON.stringify(this.world));
    this.restore(previous);
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(JSON.stringify(this.world));
    this.restore(next);
  }
  private restore(snapshot: string) {
    const before = this.world.tracks.length + this.world.decorations.length;
    this.selectedDecorationIndex = null;
    this.world = JSON.parse(snapshot);
    this.commit();
    // A reset changes the whole scene; bring the restored world back into view.
    const after = this.world.tracks.length + this.world.decorations.length;
    if (Math.abs(after - before) > 1) this.home();
  }
  reset() {
    this.remember();
    this.world = {
      version: 1,
      chunks: [{ x: 0, y: 0 }],
      tracks: [{ x: 8, y: 9, entry: 0, exit: 0 }],
      decorations: [],
      closed: false,
    };
    this.playing = false;
    this.distance = 0.5;
    this.travelDirection = 1;
    this.tool = "track";
    this.selected = true;
    this.selectedDecorationIndex = null;
    this.commit();
    this.home();
  }
  home() {
    const camera = this.cameras.main;
    const mobile = this.scale.width < 760;
    const chunkCorners = this.world.chunks.flatMap((chunk) => {
      const minX = chunk.x * CHUNK_SIZE - 0.5;
      const minY = chunk.y * CHUNK_SIZE - 0.5;
      const maxX = (chunk.x + 1) * CHUNK_SIZE - 0.5;
      const maxY = (chunk.y + 1) * CHUNK_SIZE - 0.5;
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ].map(project);
    });
    const objectPoints = [...this.world.tracks, ...this.world.decorations].map(project);
    const points = [...chunkCorners, ...objectPoints];
    const minX = Math.min(...points.map((p) => p.x)) - 45,
      maxX = Math.max(...points.map((p) => p.x)) + 45;
    const minY = Math.min(...points.map((p) => p.y)) - (mobile ? 30 : 100),
      maxY = Math.max(...points.map((p) => p.y)) + 30;
    const area = {
      left: mobile ? 12 : 35,
      right:
        this.scale.width - (mobile ? 165 : this.scale.width < 1000 ? 225 : 250),
      top: this.scale.height < 550 ? 22 : mobile ? 28 : 32,
      bottom: this.scale.height - (this.scale.height < 550 ? 70 : 92),
    };
    const zoom = Phaser.Math.Clamp(
      Math.min(
        (area.right - area.left) / (maxX - minX),
        (area.bottom - area.top) / (maxY - minY),
      ),
      0.3,
      mobile ? 0.82 : 1.18,
    );
    camera.setZoom(zoom);
    camera.centerOn(
      (minX + maxX) / 2 +
        (this.scale.width / 2 - (area.left + area.right) / 2) / zoom,
      (minY + maxY) / 2 +
        (this.scale.height / 2 - (area.top + area.bottom) / 2) / zoom,
    );
    this.emit();
  }
  zoom(factor: number, x = this.scale.width / 2, y = this.scale.height / 2) {
    const camera = this.cameras.main;
    const old = camera.zoom,
      next = Phaser.Math.Clamp(old * factor, 0.3, 2.2);
    camera.scrollX += (x - camera.width / 2) * (1 / old - 1 / next);
    camera.scrollY += (y - camera.height / 2) * (1 / old - 1 / next);
    camera.setZoom(next);
    this.preview.clear();
    this.emit();
  }
  previewTurn(turn: Turn | null) {
    this.preview.clear().setAlpha(1);
    if (turn === null) return;
    const track = candidate(this.world, turn);
    if (track) drawTrack(this.preview, track, 0.6);
  }
  private drawWorld() {
    ground(this.floor, this.world.chunks);
    this.rails.clear();
    for (const track of this.world.tracks) drawTrack(this.rails, track);
    this.scenery.forEach((g) => g.destroy());
    this.scenery = this.world.decorations.map((d) => {
      const p = project(d);
      const isWater = d.kind === "water";
      const isOverlay = isTrackOverlayKind(d.kind);
      const g = this.add
        .graphics({ x: p.x, y: p.y })
        .setDepth(isWater ? 0.5 : (isOverlay ? 13 : 10) + p.y);

      if (isWater) {
        const connected = [
          { x: d.x + 1, y: d.y },
          { x: d.x, y: d.y + 1 },
          { x: d.x - 1, y: d.y },
          { x: d.x, y: d.y - 1 },
        ].map((cell) =>
          this.world.decorations.some(
            (other) => other.kind === "water" && same(other, cell),
          ),
        );
        waterTile(g, connected);
      } else if (isOverlay) {
        const track = this.world.tracks.find((t) => same(t, d));
        if (track) trackDecoration(g, d.kind, track);
      } else {
        decoration(g, d.kind);
      }
      return g;
    });
    this.marker.clear();
    const first = project(sampleTrack(this.world.tracks[0], 0).point);
    this.marker
      .lineStyle(6, 0x95714f)
      .lineBetween(first.x - 7, first.y - 11, first.x + 7, first.y - 4);
    this.marker
      .lineStyle(3, 0xf3ddaf)
      .lineBetween(first.x - 7, first.y - 14, first.x + 7, first.y - 7);
  }
  private routeLength() {
    return this.world.tracks.reduce((sum, t) => sum + trackLength(t), 0);
  }
  update(_time: number, delta: number) {
    if (!this.train) return;
    const length = this.routeLength();
    if (this.playing) {
      this.distance +=
        (Math.min(delta, 60) / 1000) * this.speed * 1.25 * this.travelDirection;
      if (this.world.closed) this.distance = (this.distance + length) % length;
      else if (this.distance >= length - 0.12) {
        this.distance = length - 0.12;
        this.travelDirection = -1;
      } else if (this.distance <= 0.12) {
        this.distance = 0.12;
        this.travelDirection = 1;
      }
    }
    const pose = sampleRoute(this.world.tracks, this.distance);
    const tangent = {
      x: pose.tangent.x * this.travelDirection,
      y: pose.tangent.y * this.travelDirection,
    };
    this.train.clear();
    locomotive(this.train, pose.point, tangent);
    this.train.setDepth(10 + project(pose.point).y);
    const behind = this.distance - 0.52 * this.travelDirection;
    this.carriage.clear();
    if (this.world.closed || (behind > 0 && behind < length)) {
      const car = sampleRoute(this.world.tracks, (behind + length) % length);
      locomotive(this.carriage, car.point, car.tangent, true);
      this.carriage.setDepth(10 + project(car.point).y);
    }
    const last = this.world.tracks.at(-1)!;
    const endpoint = project(sampleTrack(last, 1).point),
      camera = this.cameras.main;
    const x =
      (endpoint.x - camera.scrollX - camera.width / 2) * camera.zoom +
      camera.width / 2;
    const y =
      (endpoint.y - camera.scrollY - camera.height / 2) * camera.zoom +
      camera.height / 2;
    this.onAnchor?.(
      x,
      y,
      this.selected && this.tool === "track" && !this.world.closed,
      !candidate(this.world, 0),
    );

    const selectedDecoration =
      this.selectedDecorationIndex === null
        ? null
        : this.world.decorations[this.selectedDecorationIndex];
    if (selectedDecoration) {
      const selectedPos = project(selectedDecoration);
      const selectedX =
        (selectedPos.x - camera.scrollX - camera.width / 2) * camera.zoom +
        camera.width / 2;
      const selectedY =
        (selectedPos.y - camera.scrollY - camera.height / 2) * camera.zoom +
        camera.height / 2;
      const visible =
        selectedX > 24 &&
        selectedX < camera.width - 24 &&
        selectedY > 24 &&
        selectedY < camera.height - 24;
      this.onDecorationAnchor?.(
        selectedX,
        selectedY - 44 * camera.zoom,
        visible,
      );
    } else {
      this.onDecorationAnchor?.(0, 0, false);
    }

    if (this.onExpansionAnchors) {
      const anchors: ExpansionAnchor[] = exposedChunkEdges(this.world).map(
        ({ chunk, edge }) => {
          const minX = chunk.x * CHUNK_SIZE - 0.5;
          const minY = chunk.y * CHUNK_SIZE - 0.5;
          const maxX = (chunk.x + 1) * CHUNK_SIZE - 0.5;
          const maxY = (chunk.y + 1) * CHUNK_SIZE - 0.5;
          const midpoint =
            edge === "x-"
              ? { x: minX, y: (minY + maxY) / 2 }
              : edge === "x+"
                ? { x: maxX, y: (minY + maxY) / 2 }
                : edge === "y-"
                  ? { x: (minX + maxX) / 2, y: minY }
                  : { x: (minX + maxX) / 2, y: maxY };
          const next = neighboringChunk(chunk, edge);
          const nextCenter = {
            x: next.x * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5,
            y: next.y * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5,
          };
          const worldPoint = project(midpoint);
          const worldNext = project(nextCenter);
          const edgeScreenX =
            (worldPoint.x - camera.scrollX - camera.width / 2) * camera.zoom +
            camera.width / 2;
          const edgeScreenY =
            (worldPoint.y - camera.scrollY - camera.height / 2) * camera.zoom +
            camera.height / 2;
          const dx = worldNext.x - worldPoint.x;
          const dy = worldNext.y - worldPoint.y;
          const length = Math.hypot(dx, dy) || 1;

          // Keep the control completely outside the board instead of sitting
          // on top of playable cells. The offset stays screen-sized while zooming.
          const outwardOffset = camera.width < 760 ? 38 : 46;
          const screenX = edgeScreenX + (dx / length) * outwardOffset;
          const screenY = edgeScreenY + (dy / length) * outwardOffset;

          return {
            chunk,
            edge,
            x: screenX,
            y: screenY,
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
            visible:
              screenX > 24 &&
              screenX < camera.width - 24 &&
              screenY > 24 &&
              screenY < camera.height - 24,
          };
        },
      );
      this.onExpansionAnchors(anchors);
    }
  }
  private configureInput() {
    const down = () => this.input.manager.pointers.filter((p) => p.isDown);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (down().length >= 2) {
        this.drag = null;
        this.pinch = Phaser.Math.Distance.BetweenPoints(down()[0], down()[1]);
        this.preview.clear();
        return;
      }
      this.drag = {
        id: p.id,
        x: p.x,
        y: p.y,
        lastX: p.x,
        lastY: p.y,
        moved: false,
      };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const fingers = down();
      if (fingers.length >= 2) {
        const distance = Phaser.Math.Distance.BetweenPoints(
          fingers[0],
          fingers[1],
        );
        if (this.pinch > 0)
          this.zoom(
            distance / this.pinch,
            (fingers[0].x + fingers[1].x) / 2,
            (fingers[0].y + fingers[1].y) / 2,
          );
        this.pinch = distance;
        return;
      }
      if (p.isDown && this.drag?.id === p.id) {
        const d = this.drag;
        if (Math.hypot(p.x - d.x, p.y - d.y) > 7) d.moved = true;
        if (d.moved) {
          this.cameras.main.scrollX -= (p.x - d.lastX) / this.cameras.main.zoom;
          this.cameras.main.scrollY -= (p.y - d.lastY) / this.cameras.main.zoom;
          this.preview.clear();
        }
        d.lastX = p.x;
        d.lastY = p.y;
        return;
      }
      this.previewAt(p);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.drag?.id === p.id && !this.drag.moved) this.tap(p);
      this.drag = null;
      this.pinch = 0;
    });
    this.input.on("pointerupoutside", () => {
      this.drag = null;
      this.pinch = 0;
    });
    this.input.on("gameout", () => this.preview.clear());
    this.input.on(
      "wheel",
      (p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) =>
        this.zoom(dy > 0 ? 0.9 : 1.1, p.x, p.y),
    );
  }
  private cellAt(p: Phaser.Input.Pointer) {
    return unproject(
      p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2,
    );
  }
  private previewAt(p: Phaser.Input.Pointer) {
    const cell = this.cellAt(p);
    this.preview.clear();
    if (!inside(cell, this.world) || this.tool === "track" || this.tool === "select") return;

    const decorationAtCell = this.world.decorations.some((d) => same(d, cell));
    const trackAtCell = this.world.tracks.find((track) => same(track, cell));
    const overlay = this.tool !== "erase" && isTrackOverlayKind(this.tool);
    const canPlace =
      this.tool === "erase"
        ? decorationAtCell || Boolean(trackAtCell)
        : overlay
          ? Boolean(trackAtCell) && !decorationAtCell
          : !trackAtCell && !decorationAtCell;

    const pos = project(cell);
    this.preview.save().translateCanvas(pos.x, pos.y);
    diamond(this.preview, canPlace ? 0xfff8db : 0xcf7563, 0.5);

    if (this.tool !== "erase" && canPlace) {
      this.preview.setAlpha(0.68);
      if (overlay && trackAtCell) trackDecoration(this.preview, this.tool, trackAtCell);
      else if (this.tool === "water") waterTile(this.preview, [false, false, false, false]);
      else decoration(this.preview, this.tool);
    } else {
      this.preview.setAlpha(1);
    }
    this.preview.restore();
  }
  private tap(p: Phaser.Input.Pointer) {
    const cell = this.cellAt(p);
    if (!inside(cell, this.world)) return;

    const decorationIndex = this.world.decorations.findIndex((d) =>
      same(d, cell),
    );
    if (decorationIndex >= 0) {
      this.selectedDecorationIndex = decorationIndex;
      this.tool = "select";
      this.selected = false;
      this.preview.clear();
      this.emit();
      return;
    }

    if (this.tool === "track") {
      const last = this.world.tracks.at(-1)!;
      if (same(cell, last) || same(cell, nextCell(last))) {
        this.selectedDecorationIndex = null;
        this.selected = true;
        this.emit();
      } else {
        this.selected = false;
        this.onMessage?.("Yolu uzatmak için en son raya dokun.");
      }
      return;
    }

    if (this.tool === "erase") {
      if (same(cell, this.world.tracks.at(-1)!)) this.removeLast();
      else this.onMessage?.("Silmek istediğin nesneye dokun.");
      return;
    }

    if (this.tool === "select") {
      this.selectedDecorationIndex = null;
      this.preview.clear();
      this.emit();
      return;
    }

    const kind = this.tool;
    const overlay = isTrackOverlayKind(kind);
    this.remember();
    const placed = placeDecoration(this.world, cell, kind);
    if (!placed) {
      this.history.pop();
      this.onMessage?.(
        overlay
          ? "İstasyon ve tünelleri bir ray parçasının üstüne yerleştir."
          : "Buraya eklenemiyor. Boş bir kare seç.",
      );
      return;
    }

    // Decoration placement is deliberately one-shot for young players.
    this.tool = "select";
    this.selectedDecorationIndex = null;
    this.selected = false;
    this.commit();
  }
}
