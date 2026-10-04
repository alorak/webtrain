import Phaser from "phaser";
import {
  activePiece,
  addBranch,
  advanceTrain,
  branchCandidate,
  branchKinds,
  CHUNK_SIZE,
  connectedDecorationEdges,
  createWorld,
  expandChunk,
  exposedChunkEdges,
  extendCandidate,
  extendFrom,
  inside,
  isGrassKind,
  isGroundLayer,
  isPenKind,
  isSwitch,
  isRoadKind,
  isTileKind,
  isTrackOverlayKind,
  linked,
  neighboringChunk,
  openEnds,
  parseWorld,
  penLinks,
  piecesAt,
  placeDecoration,
  removableTrack,
  removeTrack,
  setStation,
  stationAt,
  stationDwell,
  stationStop,
  doorsOnRoad,
  roadAtEntrance,
  roadNeighbours,
  same,
  sampleTrack,
  STORAGE_KEY,
  switchThrown,
  toggleSwitch,
  trainPose,
  vectors,
  type BranchKind,
  type Chunk,
  type ChunkEdge,
  type DecorationKind,
  type Heading,
  type Point,
  type RailEnd,
  type Tool,
  type Track,
  type TrainState,
  type Turn,
  type World,
  bufferAt,
  bufferSide,
  crossingAt,
  isBridge,
} from "../game/model";
import {
  bridgeLayers,
  bridgeRails,
  decoration,
  diamond,
  drawTrack,
  ground,
  locomotive,
  project,
  roadTile,
  trackDecoration,
  trackDecorationLayers,
  type StructureLayer,
  unproject,
  grassTile,
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

// Screen positions of the controls around the selected rail.
export interface RailControls {
  end: {
    x: number;
    y: number;
    heading: Heading;
    can: boolean[];
    targets: { x: number; y: number }[];
    remove: boolean;
  } | null;
  branch: { x: number; y: number; heading: Heading; can: Record<BranchKind, boolean> } | null;
  toggle: { x: number; y: number; thrown: boolean } | null;
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
  saved = true;
  private selectedRail: Point | null = null;
  private history: string[] = [];
  private future: string[] = [];
  private scenery: Phaser.GameObjects.Graphics[] = [];
  // Level crossings animate their barriers when a train comes near.
  private crossings: {
    cell: Point;
    track: Track;
    layers: { g: Phaser.GameObjects.Graphics; layer: StructureLayer }[];
    gate: number;
    blink: number;
  }[] = [];
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
  private trainState: TrainState = { track: 0, forward: true, t: 0.8 };
  private trainTrack: Track | null = null;
  // Pieces the train just left, so its wagon follows it through switches.
  private trail: Track[] = [];
  // A train held at a station: where, and until when (scene time, ms).
  private dwellCell: Point | null = null;
  private dwellUntil = 0;
  private selectedStation: Point | null = null;
  // A second camera draws the selected station on the game canvas, under
  // the info panel; after each frame that area is copied into the panel.
  private stationCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private stationCanvas: HTMLCanvasElement | null = null;
  private speed = 1;
  onChange?: (status: GameStatus) => void;
  onMessage?: (message: string) => void;
  onRailControls?: (controls: RailControls) => void;
  onStation?: (cell: Point | null) => void;
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
    this.selectedRail = this.world.tracks.at(-1)!;
    this.drawWorld();
    this.home();
    this.configureInput();
    this.scale.on("resize", this.resize, this);
    this.events.once("shutdown", () =>
      this.scale.off("resize", this.resize, this),
    );
    this.game.events.on("postrender", this.copyStationView, this);
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
    this.syncTrain();
    this.preview.clear();
    this.drawWorld();
    this.emit();
  }
  setTool(tool: Tool) {
    this.tool = tool;
    this.selectedRail = tool === "track" ? this.world.tracks.at(-1)! : null;
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
  // The loose end the rail controls extend: a switch's own branch first.
  private railEnd(): RailEnd | null {
    const cell = this.selectedRail;
    if (!cell) return null;
    const ends = openEnds(this.world).filter((e) => same(e.track, cell));
    return (
      ends.find((e) => e.track.entry !== e.track.exit && isSwitch(this.world, cell)) ??
      ends.find((e) => e.side === e.track.exit) ??
      ends[0] ??
      null
    );
  }
  extend(turn: Turn) {
    const end = this.railEnd();
    if (!end || !extendCandidate(this.world, end, turn)) {
      this.onMessage?.(
        end && bufferAt(this.world, end.track)
          ? "Bu uçta tampon var. Uzatmak için önce tamponu kaldır."
          : "Burada yer yok. Başka bir yön seç.",
      );
      return;
    }
    this.remember();
    const track = extendFrom(this.world, end, turn)!;
    this.selectedRail = { x: track.x, y: track.y };
    this.commit();
    if (linked(this.world, track, track.exit).length)
      this.onMessage?.("Raylar birleşti! Treni çalıştır.");
  }
  branch(kind: BranchKind) {
    const cell = this.selectedRail;
    if (!cell || !branchCandidate(this.world, cell, kind)) {
      this.onMessage?.("Bu yönde yer yok. Yandaki kare boş olmalı.");
      return;
    }
    this.remember();
    addBranch(this.world, cell, kind);
    this.commit();
    this.onMessage?.("Makas eklendi. Yeni kolu uzatabilir, makası değiştirebilirsin.");
  }
  toggleSelectedSwitch() {
    const cell = this.selectedRail;
    if (!cell || !isSwitch(this.world, cell)) return;
    this.remember();
    toggleSwitch(this.world, cell);
    this.commit();
  }
  removeSelectedTrack() {
    const cell = this.selectedRail;
    const track = cell && removableTrack(this.world, cell);
    if (!cell || !track) {
      this.onMessage?.(
        this.world.tracks.length <= 1
          ? "Başlangıç rayı burada kalsın. Buradan yeni bir yol yapabilirsin."
          : "Yalnızca açık uçtaki raylar silinebilir.",
      );
      return;
    }
    this.remember();
    // Keep editing from the rail the removed piece was attached to.
    const neighbour = [((track.entry + 2) % 4), track.exit]
      .flatMap((side) => linked(this.world, track, side))[0];
    removeTrack(this.world, cell);
    this.selectedRail = piecesAt(this.world, cell).length
      ? cell
      : neighbour
        ? { x: neighbour.x, y: neighbour.y }
        : null;
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
    this.loadWorld({
      version: 1,
      chunks: [{ x: 0, y: 0 }],
      tracks: [{ x: 8, y: 9, entry: 0, exit: 0 }],
      decorations: [],
      closed: false,
    });
    // A fresh world starts with its only rail ready to extend.
    this.setTool("track");
  }
  // Replaces the whole world (new game, a save or an import); undo brings
  // the previous one back.
  loadWorld(world: World) {
    this.remember();
    this.world = structuredClone(world);
    this.playing = false;
    this.trainState = { track: 0, forward: true, t: 0.5 };
    this.trainTrack = null;
    this.tool = "select";
    this.selectedRail = null;
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
    const end = this.railEnd();
    if (turn === null || !end) return;
    const track = extendCandidate(this.world, end, turn);
    if (track) drawTrack(this.preview, track, 0.6);
  }
  previewBranch(kind: BranchKind | null) {
    this.preview.clear().setAlpha(1);
    const cell = this.selectedRail;
    if (kind === null || !cell) return;
    const track = branchCandidate(this.world, cell, kind);
    if (track) drawTrack(this.preview, track, 0.6);
  }
  private drawWorld() {
    ground(this.floor, this.world.chunks);
    this.rails.clear();
    // At a switch the route not taken is drawn first and faded.
    const idle = (t: Track) => isSwitch(this.world, t) && activePiece(this.world, t) !== t;
    const surface = (t: Track) =>
      isBridge(this.world, t) ? "bridge" : crossingAt(this.world, t) ? "crossing" : "ballast";
    for (const track of this.world.tracks.filter(idle))
      drawTrack(this.rails, track, 0.5, surface(track));
    for (const track of this.world.tracks.filter((t) => !idle(t)))
      drawTrack(this.rails, track, 1, surface(track));
    this.scenery.forEach((g) => g.destroy());
    this.crossings = [];
    const extra: Phaser.GameObjects.Graphics[] = [];
    // Railings on bridges, one each side of the train.
    for (const track of this.world.tracks.filter((t) => isBridge(this.world, t))) {
      const p = project(track);
      for (const { layer, depth } of bridgeLayers(track)) {
        const g = this.add.graphics({ x: p.x, y: p.y }).setDepth(10 + p.y + depth);
        bridgeRails(g, track, layer);
        extra.push(g);
      }
    }
    this.scenery = this.world.decorations.map((d) => {
      const p = project(d);
      const isWater = d.kind === "water";
      const roadKind = isRoadKind(d.kind) ? d.kind : null;
      const grassKind = isGrassKind(d.kind) ? d.kind : null;
      const isOverlay = isTrackOverlayKind(d.kind);
      const g = this.add
        .graphics({ x: p.x, y: p.y })
        .setDepth(
          grassKind ? 0.4 : isWater ? 0.5 : roadKind ? 0.72 : (isOverlay ? 13 : 10) + p.y,
        );

      if (grassKind) {
        grassTile(g, grassKind, connectedDecorationEdges(this.world, d, grassKind));
      } else if (isWater) {
        waterTile(g, connectedDecorationEdges(this.world, d, d.kind));
      } else if (roadKind) {
        roadTile(g, roadKind, roadNeighbours(this.world, d), doorsOnRoad(this.world, d));
      } else if (isOverlay) {
        // Stations and tunnels split into layers so trains pass between them.
        const track = this.world.tracks.find((t) => same(t, d));
        const end = track && bufferSide(this.world, track) === track.exit ? 1 : 0;
        const crossing =
          track && d.kind === "levelCrossing"
            ? { cell: { x: d.x, y: d.y }, track, layers: [] as { g: Phaser.GameObjects.Graphics; layer: StructureLayer }[], gate: 1, blink: -1 }
            : null;
        if (crossing && track) {
          // The road runs across the rail at right angles, under the rails.
          const road = this.add.graphics({ x: p.x, y: p.y }).setDepth(0.72);
          roadTile(
            road,
            "roadDirt",
            [0, 1, 2, 3].map((side) => ((side - track.entry) % 2 ? "roadDirt" : null)),
          );
          extra.push(road);
          this.crossings.push(crossing);
        }
        if (track)
          trackDecorationLayers(d.kind, track, end).forEach(({ layer, depth }, i) => {
            const target =
              i === 0 ? g : this.add.graphics({ x: p.x, y: p.y });
            target.setDepth(10 + p.y + depth);
            trackDecoration(target, d.kind, track, layer, { end });
            crossing?.layers.push({ g: target, layer });
            if (i > 0) extra.push(target);
          });
      } else {
        decoration(g, d.kind, {
          road: roadAtEntrance(this.world, d),
          pen: isPenKind(d.kind) ? penLinks(this.world, d) : undefined,
        });
      }
      return g;
    });
    this.scenery.push(...extra);
    this.marker.clear();
    const first = project(sampleTrack(this.world.tracks[0], 0).point);
    this.marker
      .lineStyle(6, 0x95714f)
      .lineBetween(first.x - 7, first.y - 11, first.x + 7, first.y - 4);
    this.marker
      .lineStyle(3, 0xf3ddaf)
      .lineBetween(first.x - 7, first.y - 14, first.x + 7, first.y - 7);
  }
  // Keeps the train on the same piece across edits, or restarts it.
  private copyStationView() {
    const camera = this.stationCamera;
    const target = this.stationCanvas;
    if (!camera || !target) return;
    const source = this.game.canvas;
    const ratio = source.width / (source.clientWidth || source.width);
    const width = Math.round(camera.width * ratio);
    const height = Math.round(camera.height * ratio);
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    target
      .getContext("2d")
      ?.drawImage(source, camera.x * ratio, camera.y * ratio, width, height, 0, 0, width, height);
  }
  // Lowers the barriers while the train is close, and flashes the lights.
  private animateCrossings(time: number, delta: number, train: Point[]) {
    for (const crossing of this.crossings) {
      const close = train.some(
        (p) => Math.hypot(p.x - crossing.cell.x, p.y - crossing.cell.y) < 1.4,
      );
      const target = close ? 0 : 1;
      const gate = crossing.gate + (target - crossing.gate) * Math.min(1, delta / 160);
      const blink = close || gate < 0.98 ? Math.floor(time / 380) % 2 : -1;
      if (Math.abs(gate - crossing.gate) < 0.002 && blink === crossing.blink) continue;
      crossing.gate = Math.abs(gate - target) < 0.002 ? target : gate;
      crossing.blink = blink;
      for (const { g, layer } of crossing.layers) {
        g.clear();
        trackDecoration(g, "levelCrossing", crossing.track, layer, { gate: crossing.gate, blink });
      }
    }
  }
  // Whether the train is still waiting at an open station.
  private heldAtStation(time: number) {
    const cell = this.dwellCell;
    const station = cell && stationAt(this.world, cell);
    if (station && !station.closed && time < this.dwellUntil) return true;
    this.dwellCell = null;
    return false;
  }
  // What the station panel shows for a station.
  stationInfo(cell: Point) {
    const station = stationAt(this.world, cell);
    if (!station) return null;
    const now = this.time.now;
    const waiting =
      Boolean(this.dwellCell && same(this.dwellCell, cell)) &&
      !station.closed &&
      now < this.dwellUntil;
    return {
      kind: station.kind,
      name: station.name,
      closed: Boolean(station.closed),
      dwell: stationDwell(station),
      waiting,
      remaining: waiting ? Math.ceil((this.dwellUntil - now) / 1000) : 0,
    };
  }
  selectStation(cell: Point | null) {
    this.selectedStation = cell ? { x: cell.x, y: cell.y } : null;
    if (!cell) this.setStationView(null);
    this.onStation?.(this.selectedStation);
  }
  setStationSettings(settings: {
    closed?: boolean;
    dwell?: number;
    name?: string;
  }) {
    if (!this.selectedStation) return;
    this.remember();
    setStation(this.world, this.selectedStation, settings);
    this.commit();
  }
  // Shows the selected station in the panel's canvas, which sits over the
  // given screen rectangle.
  setStationView(
    rect: { x: number; y: number; width: number; height: number } | null,
    canvas: HTMLCanvasElement | null = null,
  ) {
    if (!rect || !this.selectedStation) {
      if (this.stationCamera) this.cameras.remove(this.stationCamera);
      this.stationCamera = null;
      this.stationCanvas = null;
      return;
    }
    this.stationCanvas = canvas;
    if (!this.stationCamera) {
      this.stationCamera = this.cameras.add(rect.x, rect.y, rect.width, rect.height);
      this.stationCamera.setBackgroundColor(0xa7c882).ignore(this.preview);
    }
    const p = project(this.selectedStation);
    this.stationCamera
      .setViewport(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height))
      .setZoom(1.6)
      .centerOn(p.x, p.y - 18);
  }
  private syncTrain() {
    const t = this.trainTrack;
    const index = t
      ? this.world.tracks.findIndex(
          (p) => same(p, t) && p.entry === t.entry && p.exit === t.exit,
        )
      : this.trainState.track;
    if (index < 0 || !this.world.tracks[index])
      this.trainState = { track: 0, forward: true, t: 0.5 };
    else this.trainState = { ...this.trainState, track: index };
    this.trainTrack = this.world.tracks[this.trainState.track];
    this.trail = [];
    if (this.selectedRail && !piecesAt(this.world, this.selectedRail).length)
      this.selectedRail = null;
    if (this.selectedStation && !stationAt(this.world, this.selectedStation))
      this.selectStation(null);
  }
  private toScreen(p: Point) {
    const camera = this.cameras.main;
    return {
      x: (p.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2,
      y: (p.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2,
    };
  }
  private railControls(): RailControls {
    const cell = this.selectedRail;
    const none = { end: null, branch: null, toggle: null };
    if (this.tool !== "track" || !cell) return none;
    const pieces = piecesAt(this.world, cell);
    if (!pieces.length) return none;
    const end = this.railEnd();
    const center = this.toScreen(project(cell));
    const controls: RailControls = { ...none };
    if (end) {
      const at = sampleTrack(end.track, end.side === end.track.exit ? 1 : 0).point;
      const nextCell = {
        x: end.track.x + vectors[end.side].x,
        y: end.track.y + vectors[end.side].y,
      };
      const turns = [-1, 0, 1] as Turn[];
      const targets = turns.map((turn) => {
        // Put each action on the far edge of the next grid cell: left edge,
        // forward edge, and right edge respectively. This matches where the
        // new piece would actually end instead of orbiting the current rail end.
        const previewTrack: Track = {
          ...nextCell,
          entry: end.side,
          exit: ((end.side + turn + 4) % 4) as Heading,
        };
        return this.toScreen(project(sampleTrack(previewTrack, 1).point));
      });
      controls.end = {
        ...this.toScreen(project(at)),
        heading: end.side,
        can: turns.map((turn) => Boolean(extendCandidate(this.world, end, turn))),
        targets,
        remove: Boolean(removableTrack(this.world, cell)),
      };
    } else if (pieces.length === 1 && pieces[0].entry === pieces[0].exit) {
      controls.branch = {
        ...center,
        heading: pieces[0].entry,
        can: Object.fromEntries(
          branchKinds.map((kind) => [kind, Boolean(branchCandidate(this.world, cell, kind))]),
        ) as Record<BranchKind, boolean>,
      };
    }
    if (pieces.length === 2)
      controls.toggle = {
        x: center.x,
        y: center.y - 30 * this.cameras.main.zoom,
        thrown: switchThrown(this.world, cell),
      };
    return controls;
  }
  update(time: number, delta: number) {
    if (!this.train) return;
    if (this.playing && !this.heldAtStation(time)) {
      const before = this.trainState;
      const after =
        advanceTrain(
          this.world,
          before,
          (Math.min(delta, 60) / 1000) * this.speed * 1.25,
          { onEnter: (from) => (this.trail = [from, ...this.trail].slice(0, 6)) },
        ) ?? before;
      const stop = stationStop(this.world, before, after);
      this.trainState = stop?.state ?? after;
      if (stop) {
        this.dwellCell = { x: stop.station.x, y: stop.station.y };
        this.dwellUntil = time + stationDwell(stop.station) * 1000;
      }
    }
    this.trainTrack = this.world.tracks[this.trainState.track];
    const pose = trainPose(this.world, this.trainState);
    this.train.clear();
    locomotive(this.train, pose.point, pose.tangent);
    this.train.setDepth(10 + project(pose.point).y);
    // The wagon trails behind along the train's own path.
    const behind = advanceTrain(
      this.world,
      { ...this.trainState, forward: !this.trainState.forward },
      0.52,
      { stopAtEnd: true, prefer: this.trail },
    );
    this.carriage.clear();
    const near: Point[] = [pose.point];
    if (behind) {
      const car = trainPose(this.world, behind);
      locomotive(this.carriage, car.point, { x: -car.tangent.x, y: -car.tangent.y }, true);
      this.carriage.setDepth(10 + project(car.point).y);
      near.push(car.point);
    }
    this.animateCrossings(time, delta, near);
    const camera = this.cameras.main;
    this.onRailControls?.(this.railControls());

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

    const objectAtCell = this.world.decorations.some(
      (d) => same(d, cell) && !isGroundLayer(d.kind),
    );
    const groundAtCell = this.world.decorations.some(
      (d) => same(d, cell) && isGroundLayer(d.kind),
    );
    const trackAtCell = this.world.tracks.find((track) => same(track, cell));
    const overlay = this.tool !== "erase" && isTrackOverlayKind(this.tool);
    const canPlace =
      this.tool === "erase"
        ? objectAtCell || groundAtCell || Boolean(trackAtCell)
        : isGroundLayer(this.tool)
          ? !groundAtCell
          : overlay
            ? Boolean(trackAtCell) && !objectAtCell
            : (!trackAtCell || this.tool === "water") && !objectAtCell;

    const pos = project(cell);
    this.preview.save().translateCanvas(pos.x, pos.y);
    diamond(this.preview, canPlace ? 0xfff8db : 0xcf7563, 0.5);

    if (this.tool !== "erase" && canPlace) {
      this.preview.setAlpha(0.68);
      const roadKind = isRoadKind(this.tool) ? this.tool : null;
      if (overlay && trackAtCell) trackDecoration(this.preview, this.tool, trackAtCell);
      else if (this.tool === "water")
        waterTile(this.preview, [false, false, false, false]);
      else if (isGrassKind(this.tool))
        grassTile(this.preview, this.tool, [false, false, false, false]);
      else if (roadKind)
        roadTile(this.preview, roadKind, [false, false, false, false]);
      else decoration(this.preview, this.tool);
    } else {
      this.preview.setAlpha(1);
    }
    this.preview.restore();
  }
  private tap(p: Phaser.Input.Pointer) {
    const cell = this.cellAt(p);
    if (!inside(cell, this.world)) return;

    // Tapping a station opens its info panel, whatever tool is in hand.
    if (this.tool !== "erase" && stationAt(this.world, cell)) this.selectStation(cell);

    const indexOn = (ground: boolean) =>
      this.world.decorations.findIndex(
        (d) => same(d, cell) && isGroundLayer(d.kind) === ground,
      );
    const objectIndex = indexOn(false);
    const groundIndex = indexOn(true);
    const tool = this.tool;
    const onRail = this.world.tracks.some((t) => same(t, cell));
    if (tool === "track") {
      this.selectedRail = onRail ? cell : null;
      this.selectedDecorationIndex = null;
      if (!onRail) this.onMessage?.("Uzatmak, makas açmak ya da makası değiştirmek için bir raya dokun.");
      this.preview.clear();
      this.emit();
      return;
    }
    if (tool !== "select" && tool !== "erase") {
      const blocking = isGroundLayer(tool) ? groundIndex : objectIndex;
      if (blocking < 0) {
        this.place(cell, tool);
        return;
      }
      // While painting tiles, taps on filled cells keep the brush in hand.
      if (isTileKind(tool)) {
        if (this.world.decorations[blocking].kind !== tool)
          this.onMessage?.("Buraya eklenemiyor. Boş bir kare seç.");
        return;
      }
    }

    // Objects and rails sit on top of grass, so a tap picks them first.
    const decorationIndex =
      objectIndex >= 0 ? objectIndex : onRail ? -1 : groundIndex;
    if (decorationIndex >= 0) {
      this.selectedDecorationIndex = decorationIndex;
      this.tool = "select";
      this.selectedRail = null;
      this.preview.clear();
      this.emit();
      return;
    }

    if (this.tool === "erase") {
      if (onRail) {
        this.selectedRail = cell;
        this.removeSelectedTrack();
      } else this.onMessage?.("Silmek istediğin nesneye dokun.");
      return;
    }

    if (this.tool === "select") {
      this.selectedDecorationIndex = null;
      this.preview.clear();
      this.emit();
    }
  }
  private place(cell: Point, kind: DecorationKind) {
    const overlay = isTrackOverlayKind(kind);
    this.remember();
    const placed = placeDecoration(this.world, cell, kind);
    if (!placed) {
      this.history.pop();
      this.onMessage?.(
        kind === "bufferStop"
          ? "Tamponu bir rayın açık ucuna koy."
          : kind === "levelCrossing"
            ? "Hemzemin geçidi düz bir rayın üstüne koy."
            : overlay
              ? "İstasyon ve tünelleri bir ray parçasının üstüne yerleştir."
              : "Buraya eklenemiyor. Boş bir kare seç.",
      );
      return;
    }

    // Buildings and props are one-shot for young players; tiles keep painting.
    if (!isTileKind(kind)) this.tool = "select";
    this.selectedDecorationIndex = null;
    this.commit();
  }
}
