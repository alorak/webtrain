import Phaser from 'phaser';

type TrackDirection = 'x' | 'y';

interface GridPoint {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

export class WebTrainScene extends Phaser.Scene {
  private readonly gridSize = 18;
  private readonly tileWidth = 96;
  private readonly tileHeight = 48;

  private preview!: Phaser.GameObjects.Graphics;
  private trackDirection: TrackDirection = 'x';
  private dragState: DragState | null = null;
  private lastPinchDistance = 0;
  private readonly tracks = new Map<string, Phaser.GameObjects.Graphics>();

  constructor() {
    super('WebTrainScene');
  }

  create(): void {
    this.drawGround();
    this.preview = this.add.graphics().setDepth(1000).setVisible(false);

    this.input.addPointer(2);
    this.configureCamera();
    this.configureInput();
  }

  public rotateTrackDirection(): TrackDirection {
    this.trackDirection = this.trackDirection === 'x' ? 'y' : 'x';
    return this.trackDirection;
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    const mapWidth = this.gridSize * this.tileWidth;
    const mapHeight = this.gridSize * this.tileHeight;

    camera.setBounds(
      -mapWidth / 2 - 380,
      -280,
      mapWidth + 760,
      mapHeight + 640,
    );
    camera.setZoom(1);
    camera.centerOn(0, ((this.gridSize - 1) * this.tileHeight) / 2);
  }

  private configureInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const downPointers = this.getDownPointers();

      if (downPointers.length >= 2) {
        this.dragState = null;
        this.lastPinchDistance = this.pointerDistance(downPointers[0], downPointers[1]);
        return;
      }

      this.dragState = {
        pointerId: pointer.id,
        startX: pointer.x,
        startY: pointer.y,
        lastX: pointer.x,
        lastY: pointer.y,
        moved: false,
      };

      this.updatePreview(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const downPointers = this.getDownPointers();

      if (downPointers.length >= 2) {
        this.handlePinch(downPointers[0], downPointers[1]);
        this.preview.setVisible(false);
        return;
      }

      if (
        pointer.isDown &&
        this.dragState &&
        pointer.id === this.dragState.pointerId
      ) {
        const totalDistance = Phaser.Math.Distance.Between(
          this.dragState.startX,
          this.dragState.startY,
          pointer.x,
          pointer.y,
        );

        if (totalDistance > 7) {
          this.dragState.moved = true;
        }

        if (this.dragState.moved) {
          const camera = this.cameras.main;
          const dx = pointer.x - this.dragState.lastX;
          const dy = pointer.y - this.dragState.lastY;

          camera.scrollX -= dx / camera.zoom;
          camera.scrollY -= dy / camera.zoom;
        }

        this.dragState.lastX = pointer.x;
        this.dragState.lastY = pointer.y;
        return;
      }

      this.updatePreview(pointer);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (
        this.dragState &&
        pointer.id === this.dragState.pointerId &&
        !this.dragState.moved
      ) {
        this.placeTrackAtPointer(pointer);
      }

      this.dragState = null;
      this.lastPinchDistance = 0;
      this.updatePreview(pointer);
    });

    this.input.on(
      'wheel',
      (
        pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        this.zoomAround(pointer.x, pointer.y, deltaY > 0 ? 0.9 : 1.1);
      },
    );
  }

  private getDownPointers(): Phaser.Input.Pointer[] {
    return this.input.manager.pointers.filter((pointer) => pointer.isDown);
  }

  private handlePinch(
    first: Phaser.Input.Pointer,
    second: Phaser.Input.Pointer,
  ): void {
    const distance = this.pointerDistance(first, second);

    if (this.lastPinchDistance <= 0) {
      this.lastPinchDistance = distance;
      return;
    }

    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    const factor = Phaser.Math.Clamp(distance / this.lastPinchDistance, 0.85, 1.15);

    this.zoomAround(midpointX, midpointY, factor);
    this.lastPinchDistance = distance;
  }

  private zoomAround(screenX: number, screenY: number, factor: number): void {
    const camera = this.cameras.main;
    const before = camera.getWorldPoint(screenX, screenY);
    const nextZoom = Phaser.Math.Clamp(camera.zoom * factor, 0.55, 2.2);

    camera.setZoom(nextZoom);

    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
  }

  private pointerDistance(
    first: Phaser.Input.Pointer,
    second: Phaser.Input.Pointer,
  ): number {
    return Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
  }

  private drawGround(): void {
    const ground = this.add.graphics().setDepth(0);

    for (let gridY = 0; gridY < this.gridSize; gridY += 1) {
      for (let gridX = 0; gridX < this.gridSize; gridX += 1) {
        const center = this.gridToWorld(gridX, gridY);
        const points = this.diamondPoints(center.x, center.y);
        const alternate = (gridX + gridY) % 2 === 0;

        ground.fillStyle(alternate ? 0x88cf48 : 0x83ca43, 1);
        ground.fillPoints(points, true);
        ground.lineStyle(1, 0xb7e47b, 0.58);
        ground.strokePoints(points, true);
      }
    }
  }

  private placeTrackAtPointer(pointer: Phaser.Input.Pointer): void {
    const cell = this.pointerToGrid(pointer);
    if (!cell) return;

    const key = `${cell.x}:${cell.y}`;
    const previous = this.tracks.get(key);
    previous?.destroy();

    const center = this.gridToWorld(cell.x, cell.y);
    const track = this.add.graphics({
      x: center.x,
      y: center.y,
    });

    track.setDepth(100 + center.y);
    this.drawStraightTrack(track, this.trackDirection, 1);
    this.tracks.set(key, track);
  }

  private updatePreview(pointer: Phaser.Input.Pointer): void {
    const cell = this.pointerToGrid(pointer);

    if (!cell) {
      this.preview.setVisible(false);
      return;
    }

    const center = this.gridToWorld(cell.x, cell.y);
    this.preview.clear();
    this.preview.setPosition(center.x, center.y);

    const diamond = this.diamondPoints(0, 0);
    this.preview.lineStyle(3, 0xffffff, 0.58);
    this.preview.strokePoints(diamond, true);
    this.drawStraightTrack(this.preview, this.trackDirection, 0.52);
    this.preview.setVisible(true);
  }

  private drawStraightTrack(
    graphics: Phaser.GameObjects.Graphics,
    direction: TrackDirection,
    alpha: number,
  ): void {
    const halfX = this.tileWidth / 2;
    const halfY = this.tileHeight / 2;

    const start = direction === 'x'
      ? new Phaser.Math.Vector2(-halfX, -halfY)
      : new Phaser.Math.Vector2(-halfX, halfY);
    const end = direction === 'x'
      ? new Phaser.Math.Vector2(halfX, halfY)
      : new Phaser.Math.Vector2(halfX, -halfY);

    const vector = end.clone().subtract(start);
    const length = vector.length();
    const unit = vector.clone().normalize();
    const normal = new Phaser.Math.Vector2(-unit.y, unit.x);

    graphics.lineStyle(6, 0x7b5b3d, alpha);
    for (let index = 0; index < 9; index += 1) {
      const t = index / 8;
      const centerX = Phaser.Math.Linear(start.x, end.x, t);
      const centerY = Phaser.Math.Linear(start.y, end.y, t);
      const sleeperHalf = 13;

      graphics.lineBetween(
        centerX - normal.x * sleeperHalf,
        centerY - normal.y * sleeperHalf,
        centerX + normal.x * sleeperHalf,
        centerY + normal.y * sleeperHalf,
      );
    }

    const railOffset = 6;
    graphics.lineStyle(4, 0x53565a, alpha);

    for (const side of [-1, 1]) {
      const offsetX = normal.x * railOffset * side;
      const offsetY = normal.y * railOffset * side;

      graphics.lineBetween(
        start.x + offsetX,
        start.y + offsetY,
        start.x + unit.x * length + offsetX,
        start.y + unit.y * length + offsetY,
      );
    }
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): GridPoint | null {
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const gridX = Math.round(world.x / this.tileWidth + world.y / this.tileHeight);
    const gridY = Math.round(world.y / this.tileHeight - world.x / this.tileWidth);

    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX >= this.gridSize ||
      gridY >= this.gridSize
    ) {
      return null;
    }

    return { x: gridX, y: gridY };
  }

  private gridToWorld(gridX: number, gridY: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      ((gridX - gridY) * this.tileWidth) / 2,
      ((gridX + gridY) * this.tileHeight) / 2,
    );
  }

  private diamondPoints(centerX: number, centerY: number): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(centerX, centerY - this.tileHeight / 2),
      new Phaser.Math.Vector2(centerX + this.tileWidth / 2, centerY),
      new Phaser.Math.Vector2(centerX, centerY + this.tileHeight / 2),
      new Phaser.Math.Vector2(centerX - this.tileWidth / 2, centerY),
    ];
  }
}
