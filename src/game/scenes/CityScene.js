import Phaser from "phaser";
import { BUILDINGS, getBuildingFootprint } from "../data/buildings";

const TILE_WIDTH = 44;
const TILE_HEIGHT = 22;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const DEPTH_Y_MULTIPLIER = 10000;
const SPRITE_CENTER = 256;
const SPRITE_HEIGHT = 512;
const SLICE_WIDTH = 22;
const GRID_OFFSET_Y = 300;
const CHARACTER_FRAME_SIZE = 460;
const CHARACTER_SCALE = 0.07;
const PLAYER_SPEED = 100;

// Fixed close-up camera. The old wheel zoom topped out at 1.2.
const FIXED_CAMERA_ZOOM = 2.2;

// Extra grass tiles extend the city past its original edge, then fade into the sky.
const EDGE_PADDING_TILES = 8;
const EDGE_FADE_STRENGTH = 0.92;

const ORIENTATION_TO_SPRITE = {
  down: "south",
  up: "north",
  right: "east",
  left: "west",
};

function getSnowTextureKey(x, y) {
  const variant = ((x * 7 + y * 13) % 3) + 1;
  return `city_snow_${variant}`;
}

function getSpriteDirection(building, orientation) {
  const requested = ORIENTATION_TO_SPRITE[orientation] || "south";
  if (building.sprites?.[requested]) return requested;
  if (building.sprites?.south) return "south";
  return Object.keys(building.sprites || {})[0];
}

export default class CityScene extends Phaser.Scene {
  constructor() {
    super("CityScene");
    this.citySave = null;
    this.grid = [];
    this.gridOffsetX = 0;
    this.worldWidth = 0;
    this.worldHeight = 0;
    this.gridOffsetY = GRID_OFFSET_Y;
    this.skyBackdrop = null;
    this.skyClouds = [];
    this.keys = null;
    this.isPanning = false;
    this.lastPointer = { x: 0, y: 0 };
    this.player = null;
    this.playerFacingRow = 0;
    this.playerFlipX = false;
    this.controlHint = null;
    this.isDraggingCamera = false;
  }

  preload() {
    // These paths match PogiCity's public asset folder structure.
    this.load.image("city_grass", "/Tiles/1x1grass.png");
    this.load.image("city_road", "/Tiles/1x1square_tile.png");
    this.load.image("city_asphalt", "/Tiles/1x1asphalt_tile.png");
    this.load.image("city_snow_1", "/Tiles/1x1snow_tile_1.png");
    this.load.image("city_snow_2", "/Tiles/1x1snow_tile_2.png");
    this.load.image("city_snow_3", "/Tiles/1x1snow_tile_3.png");

    // Character0 is a 5-direction isometric character sheet:
    // Walk: 6 frames per row; Idle: 8 frames per row; each frame is 460x460.
    this.load.spritesheet(
      "phishville_character_walk",
      "/assets/characters/Character0/Character0_Walk.png",
      { frameWidth: CHARACTER_FRAME_SIZE, frameHeight: CHARACTER_FRAME_SIZE }
    );
    this.load.spritesheet(
      "phishville_character_idle",
      "/assets/characters/Character0/Character0_Idle.png",
      { frameWidth: CHARACTER_FRAME_SIZE, frameHeight: CHARACTER_FRAME_SIZE }
    );
  }

  async create() {
    this.cameras.main.setBackgroundColor("#b9d9eb");
    this.add.text(18, 14, "PHISHVILLE", {
      fontFamily: "Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#17372b",
      backgroundColor: "#ffffffcc",
      padding: { x: 10, y: 6 },
    }).setScrollFactor(0).setDepth(1000000000);

    try {
      const response = await fetch("/maps/phishville-city.json");
      if (!response.ok) {
        throw new Error(`Could not load map JSON (${response.status})`);
      }

      this.citySave = await response.json();
      this.grid = this.citySave.grid;
      if (!Array.isArray(this.grid) || !this.grid.length || !this.grid[0]?.length) {
        throw new Error("The city save does not contain a valid grid.");
      }

      this.queueBuildingTextures();
      this.load.once("complete", () => {
        this.renderCity();
        this.setupCameraAndControls();
      });
      this.load.on("loaderror", (file) => {
        console.error("PhishVille could not load city asset:", file?.src || file?.key);
      });
      this.load.start();
    } catch (error) {
      console.error("PhishVille city loading failed:", error);
      this.add.text(24, 70, "The city map could not be loaded. Check the browser console.", {
        fontSize: "16px",
        color: "#8b1e1e",
        backgroundColor: "#ffffffdd",
        padding: { x: 10, y: 8 },
      }).setScrollFactor(0).setDepth(1000000000);
    }
  }

  queueBuildingTextures() {
    const queued = new Set();

    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.type !== "building" || !cell.isOrigin || !cell.buildingId) continue;

        const building = BUILDINGS[cell.buildingId];
        if (!building) {
          console.warn(`No PogiCity building definition for: ${cell.buildingId}`);
          continue;
        }

        const direction = getSpriteDirection(building, cell.buildingOrientation);
        const path = building.sprites?.[direction];
        const textureKey = `city_building_${cell.buildingId}_${direction}`;
        if (!path || queued.has(textureKey) || this.textures.exists(textureKey)) continue;

        queued.add(textureKey);
        this.load.image(textureKey, path);
      }
    }
  }

  gridToWorld(gridX, gridY) {
    return {
      x: this.gridOffsetX + (gridX - gridY) * HALF_TILE_WIDTH,
      y: this.gridOffsetY + (gridX + gridY) * (TILE_HEIGHT / 2),
    };
  }

  depthFromSortPoint(sortX, sortY, layerOffset = 0) {
    return sortY * DEPTH_Y_MULTIPLIER + sortX + layerOffset;
  }

  getGroundTexture(cell, x, y) {
    if (cell.type === "grass") return "city_grass";
    if (cell.type === "road" || cell.type === "tile") return "city_road";
    if (cell.type === "asphalt") return "city_asphalt";
    if (cell.type === "snow") return getSnowTextureKey(x, y);

    if (cell.type === "building") {
      const building = BUILDINGS[cell.buildingId];
      const isProp = building && (building.category === "props" || building.isDecoration);
      if (!isProp) return "city_road";

      const under = cell.underlyingTileType;
      if (under === "tile" || under === "road") return "city_road";
      if (under === "asphalt") return "city_asphalt";
      if (under === "snow") return getSnowTextureKey(x, y);
      return "city_grass";
    }

    return "city_grass";
  }

  renderCity() {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const paddedRows = rows + EDGE_PADDING_TILES * 2;
    const paddedCols = cols + EDGE_PADDING_TILES * 2;

    // Expand the isometric world while keeping the original map centered.
    // The added ring gives the camera room at the map boundary.
    this.worldWidth = Math.ceil((paddedCols + paddedRows) * HALF_TILE_WIDTH) + TILE_WIDTH * 4;
    this.gridOffsetX = this.worldWidth / 2;
    this.gridOffsetY = GRID_OFFSET_Y + EDGE_PADDING_TILES * TILE_HEIGHT;

    const farthestGridSum = (cols + EDGE_PADDING_TILES - 1) + (rows + EDGE_PADDING_TILES - 1);
    this.worldHeight = Math.ceil(
      this.gridOffsetY + farthestGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT + 100
    );

    this.createSkyBackdrop();

    // First draw a padded grass border. Its opacity fades smoothly toward zero,
    // so the square map boundary blends into the sky instead of ending abruptly.
    for (let y = -EDGE_PADDING_TILES; y < rows + EDGE_PADDING_TILES; y++) {
      for (let x = -EDGE_PADDING_TILES; x < cols + EDGE_PADDING_TILES; x++) {
        const isInsideMap = x >= 0 && x < cols && y >= 0 && y < rows;
        if (isInsideMap) continue;

        const outsideX = x < 0 ? -x : x >= cols ? x - cols + 1 : 0;
        const outsideY = y < 0 ? -y : y >= rows ? y - rows + 1 : 0;
        const distance = Math.max(outsideX, outsideY);
        const fadeProgress = Phaser.Math.Clamp(
          1 - distance / (EDGE_PADDING_TILES + 1),
          0,
          1
        );
        const smoothFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
        const alpha = EDGE_FADE_STRENGTH * smoothFade;
        if (alpha < 0.025 || !this.textures.exists("city_grass")) continue;

        const position = this.gridToWorld(x, y);
        this.add.image(position.x, position.y, "city_grass")
          .setOrigin(0.5, 0)
          .setScale(1.02)
          .setAlpha(alpha)
          .setDepth(this.depthFromSortPoint(position.x, position.y));
      }
    }

    // Draw every original map ground tile above the faded outskirts.
    // Keep the corrected tile depth so ground never cuts into building bases.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = this.grid[y]?.[x];
        if (!cell) continue;

        const position = this.gridToWorld(x, y);
        const textureKey = this.getGroundTexture(cell, x, y);
        if (!this.textures.exists(textureKey)) continue;

        this.add.image(position.x, position.y, textureKey)
          .setOrigin(0.5, 0)
          .setScale(textureKey.startsWith("city_snow_") ? 0.51 : 1.02)
          .setDepth(this.depthFromSortPoint(position.x, position.y));
      }
    }

    // Render only each building's origin cell; multi-cell footprints are one sprite.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = this.grid[y]?.[x];
        if (!cell || cell.type !== "building" || !cell.isOrigin || !cell.buildingId) continue;
        this.renderBuilding(cell);
      }
    }

    this.createCharacterAnimations();
    this.spawnPlayer();
  }

  createSkyBackdrop() {
    const textureKey = "phishville_sky_gradient";
    if (!this.textures.exists(textureKey)) {
      const texture = this.textures.createCanvas(textureKey, 512, 512);
      const context = texture.getContext();
      const gradient = context.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, "#91c4e6");
      gradient.addColorStop(0.46, "#c7e2e9");
      gradient.addColorStop(0.78, "#e8eddf");
      gradient.addColorStop(1, "#f3e5c8");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      texture.refresh();
    }

    this.skyBackdrop = this.add.image(0, 0, textureKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2000000000);
    this.resizeSkyBackdrop(this.scale.width, this.scale.height);

    // Soft clouds live behind the isometric world. They are visible only where
    // the faded outskirts reveal the sky, so they never cover streets/buildings.
    const cloudLayouts = [
      { x: 0.13, y: 0.18, scale: 0.95, alpha: 0.62 },
      { x: 0.83, y: 0.23, scale: 1.2, alpha: 0.58 },
      { x: 0.22, y: 0.78, scale: 0.75, alpha: 0.42 },
      { x: 0.88, y: 0.76, scale: 0.9, alpha: 0.42 },
    ];

    this.skyClouds = cloudLayouts.map((layout) => {
      const cloud = this.add.graphics();
      cloud.fillStyle(0xffffff, layout.alpha);
      cloud.fillCircle(-27, 8, 18);
      cloud.fillCircle(-8, -2, 24);
      cloud.fillCircle(15, 5, 20);
      cloud.fillCircle(31, 12, 14);
      cloud.fillRoundedRect(-38, 8, 78, 20, 10);
      cloud.setScale(layout.scale);
      cloud.setScrollFactor(0);
      cloud.setDepth(-1999999999);
      cloud._phishvilleLayout = layout;
      this.positionSkyCloud(cloud, layout);
      return cloud;
    });
  }

  positionSkyCloud(cloud, layout) {
    cloud.setPosition(this.scale.width * layout.x, this.scale.height * layout.y);
  }

  resizeSkyBackdrop(width, height) {
    this.skyBackdrop?.setDisplaySize(width, height);
    for (const cloud of this.skyClouds) {
      if (cloud?._phishvilleLayout) {
        this.positionSkyCloud(cloud, cloud._phishvilleLayout);
      }
    }
  }

  renderBuilding(cell) {
    const building = BUILDINGS[cell.buildingId];
    if (!building) return;

    const orientation = cell.buildingOrientation || "down";
    const direction = getSpriteDirection(building, orientation);
    const textureKey = `city_building_${cell.buildingId}_${direction}`;
    if (!this.textures.exists(textureKey)) {
      console.warn(`Missing image for ${cell.buildingId}: ${building.sprites?.[direction]}`);
      return;
    }

    const footprint = getBuildingFootprint(building, orientation);
    const renderSize = building.renderSize || footprint;
    const frontX = cell.x + footprint.width - 1;
    const frontY = cell.y + footprint.height - 1;
    const screenPosition = this.gridToWorld(frontX, frontY);
    const bottomY = screenPosition.y + TILE_HEIGHT;

    const isExtendedDecoration = Boolean(
      building.isDecoration && building.renderSize &&
      (building.renderSize.width > footprint.width || building.renderSize.height > footprint.height)
    );

    const extendX = (renderSize.width - footprint.width) / 4;
    const extendY = (renderSize.height - footprint.height) / 4;
    const balancedGridSum = frontX + extendX + frontY + extendY;
    const decorationSortY = this.gridOffsetY + balancedGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
    const decorationDepth = this.depthFromSortPoint(screenPosition.x, decorationSortY, 0.06);

    const tint = cell.buildingId === "flower-bush" ? 0xbbddbb : null;

    // PogiCity slices 512px building art into 22px strips so characters can
    // later walk in front of or behind different parts of a tall building.
    for (let i = 0; i < renderSize.width; i++) {
      const sourceX = SPRITE_CENTER - (i + 1) * SLICE_WIDTH;
      const slice = this.add.image(screenPosition.x, bottomY, textureKey);
      slice.setOrigin(0.5, 1);
      slice.setCrop(sourceX, 0, SLICE_WIDTH, SPRITE_HEIGHT);
      if (tint !== null) slice.setTint(tint);

      if (isExtendedDecoration) {
        slice.setDepth(decorationDepth);
      } else {
        const sliceGridSum = (frontX - i) + frontY;
        const sliceSortY = this.gridOffsetY + sliceGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
        slice.setDepth(this.depthFromSortPoint(screenPosition.x, sliceSortY, 0.05));
      }
    }

    for (let i = 0; i < renderSize.height; i++) {
      const sourceX = SPRITE_CENTER + i * SLICE_WIDTH;
      const slice = this.add.image(screenPosition.x, bottomY, textureKey);
      slice.setOrigin(0.5, 1);
      slice.setCrop(sourceX, 0, SLICE_WIDTH, SPRITE_HEIGHT);
      if (tint !== null) slice.setTint(tint);

      if (isExtendedDecoration) {
        slice.setDepth(decorationDepth);
      } else {
        const sliceGridSum = frontX + (frontY - i);
        const sliceSortY = this.gridOffsetY + sliceGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
        slice.setDepth(this.depthFromSortPoint(screenPosition.x, sliceSortY, 0.05));
      }
    }
  }

  setupCameraAndControls() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldWidth, this.worldHeight);
    camera.setZoom(FIXED_CAMERA_ZOOM);

    if (this.player) {
      camera.startFollow(this.player, true, 0.12, 0.12);
      camera.setFollowOffset(0, -18);
    } else {
      camera.centerOn(this.worldWidth / 2, this.worldHeight / 2);
    }

    if (this.input.keyboard) {
      this.keys = this.input.keyboard.addKeys({
        up: "W",
        down: "S",
        left: "A",
        right: "D",
        arrowUp: "UP",
        arrowDown: "DOWN",
        arrowLeft: "LEFT",
        arrowRight: "RIGHT",
      });
    }

    this.controlHint = this.add.text(
      18,
      this.scale.height - 22,
      "WASD / ARROWS  MOVE     •     DRAG  LOOK AROUND     •     FIXED ZOOM",
      {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#17372b",
        backgroundColor: "#ffffffdd",
        padding: { x: 9, y: 6 },
      }
    ).setScrollFactor(0).setDepth(1000000000).setOrigin(0, 1);

    this.scale.on("resize", (gameSize) => {
      this.controlHint?.setPosition(18, gameSize.height - 22);
      this.resizeSkyBackdrop(gameSize.width, gameSize.height);
    });

    // Zoom is intentionally fixed at 2.2x. Mouse wheel no longer changes it.
    // Drag the mouse to look around; player-follow resumes on release.
    this.input.on("pointerdown", (pointer) => {
      this.isPanning = true;
      this.isDraggingCamera = false;
      this.lastPointer = { x: pointer.x, y: pointer.y };
      camera.stopFollow();
    });
    this.input.on("pointerup", () => {
      this.isPanning = false;
      if (this.player) camera.startFollow(this.player, true, 0.12, 0.12);
    });
    this.input.on("pointerupoutside", () => {
      this.isPanning = false;
      if (this.player) camera.startFollow(this.player, true, 0.12, 0.12);
    });
    this.input.on("pointermove", (pointer) => {
      if (!this.isPanning || !pointer.isDown) return;
      const dx = pointer.x - this.lastPointer.x;
      const dy = pointer.y - this.lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.isDraggingCamera = true;
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });
  }

  createCharacterAnimations() {
    if (!this.anims.exists("character_idle_0")) {
      for (let row = 0; row < 5; row++) {
        this.anims.create({
          key: `character_idle_${row}`,
          frames: this.anims.generateFrameNumbers("phishville_character_idle", {
            start: row * 8,
            end: row * 8 + 7,
          }),
          frameRate: 5,
          repeat: -1,
        });
        this.anims.create({
          key: `character_walk_${row}`,
          frames: this.anims.generateFrameNumbers("phishville_character_walk", {
            start: row * 6,
            end: row * 6 + 5,
          }),
          frameRate: 7,
          repeat: -1,
        });
      }
    }
  }

  findSpawnTile(preferredX = 2, preferredY = 3) {
    const preferred = this.getCell(preferredX, preferredY);
    if (preferred && preferred.type !== "building") return { x: preferredX, y: preferredY };

    // If the preferred starting tile is blocked in a modified map, find the
    // nearest walkable cell rather than spawning inside a building.
    let best = null;
    let bestDistance = Infinity;
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < (this.grid[y]?.length || 0); x++) {
        const cell = this.grid[y][x];
        if (!cell || cell.type === "building") continue;
        const distance = Math.abs(x - preferredX) + Math.abs(y - preferredY);
        if (distance < bestDistance) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  spawnPlayer() {
    if (!this.textures.exists("phishville_character_idle") ||
        !this.textures.exists("phishville_character_walk")) {
      console.error("PhishVille character sheets did not load. Check public/assets/characters/Character0.");
      return;
    }

    const spawn = this.findSpawnTile(2, 3);
    if (!spawn) {
      console.error("No walkable tile was found for the player spawn.");
      return;
    }

    const tilePosition = this.gridToWorld(spawn.x, spawn.y);
    const footX = tilePosition.x;
    const footY = tilePosition.y + TILE_HEIGHT / 2;

    this.player = this.add.sprite(footX, footY, "phishville_character_idle", 0);
    this.player.setOrigin(0.5, 0.93);
    this.player.setScale(CHARACTER_SCALE);
    this.player.setDepth(this.depthFromSortPoint(footX, footY, 0.2));
    this.playerFacingRow = 0;
    this.playerFlipX = false;
    this.player.play("character_idle_0");
  }

  getGridPositionFromWorld(worldX, worldY) {
    const relX = worldX - this.gridOffsetX;
    const relY = worldY - this.gridOffsetY;
    return {
      x: (relX / HALF_TILE_WIDTH + relY / (TILE_HEIGHT / 2)) / 2,
      y: (relY / (TILE_HEIGHT / 2) - relX / HALF_TILE_WIDTH) / 2,
    };
  }

  isWalkableWorldPosition(worldX, worldY) {
    const gridPosition = this.getGridPositionFromWorld(worldX, worldY);
    const tileX = Math.floor(gridPosition.x);
    const tileY = Math.floor(gridPosition.y);
    const cell = this.getCell(tileX, tileY);
    return Boolean(cell && cell.type !== "building");
  }

  setPlayerFacing(row, flipX) {
    if (!this.player) return;
    this.playerFacingRow = row;
    this.playerFlipX = flipX;
    this.player.setFlipX(flipX);
  }

  updatePlayer(delta) {
    if (!this.player || !this.keys) return;

    let moveX = 0;
    let moveY = 0;
    if (this.keys.left.isDown || this.keys.arrowLeft.isDown) moveX -= 1;
    if (this.keys.right.isDown || this.keys.arrowRight.isDown) moveX += 1;
    if (this.keys.up.isDown || this.keys.arrowUp.isDown) moveY -= 1;
    if (this.keys.down.isDown || this.keys.arrowDown.isDown) moveY += 1;

    const moving = moveX !== 0 || moveY !== 0;
    const dt = Math.min(delta / 1000, 0.05);

    if (moving) {
      const length = Math.hypot(moveX, moveY);
      moveX /= length;
      moveY /= length;

      // The sprite pack has five base views. The diagonal views are mirrored
      // for the opposite side, giving all eight movement directions.
      let row = 0;
      let flipX = false;
      if (moveY > 0 && moveX === 0) row = 0;          // front
      else if (moveY < 0 && moveX === 0) row = 4;     // back
      else if (moveX < 0 && moveY === 0) row = 2;     // left profile
      else if (moveX > 0 && moveY === 0) { row = 2; flipX = true; }
      else if (moveX < 0 && moveY > 0) row = 1;       // front-left
      else if (moveX > 0 && moveY > 0) { row = 1; flipX = true; }
      else if (moveX < 0 && moveY < 0) row = 3;       // back-left
      else if (moveX > 0 && moveY < 0) { row = 3; flipX = true; }

      this.setPlayerFacing(row, flipX);

      const distance = PLAYER_SPEED * dt;
      const nextX = this.player.x + moveX * distance;
      const nextY = this.player.y + moveY * distance;

      // Resolve each axis separately so the player can slide along building edges.
      if (this.isWalkableWorldPosition(nextX, this.player.y)) {
        this.player.x = nextX;
      }
      if (this.isWalkableWorldPosition(this.player.x, nextY)) {
        this.player.y = nextY;
      }

      const walkKey = `character_walk_${this.playerFacingRow}`;
      if (this.player.anims.currentAnim?.key !== walkKey) {
        this.player.play(walkKey, true);
      }
    } else {
      const idleKey = `character_idle_${this.playerFacingRow}`;
      if (this.player.anims.currentAnim?.key !== idleKey) {
        this.player.play(idleKey, true);
      }
    }

    this.player.setFlipX(this.playerFlipX);
    this.player.setDepth(this.depthFromSortPoint(this.player.x, this.player.y, 0.2));
  }

  update(_time, delta) {
    this.updatePlayer(delta);
  }

  getCell(gridX, gridY) {
    return this.grid[gridY]?.[gridX] || null;
  }

  isWalkableTile(gridX, gridY) {
    const cell = this.getCell(gridX, gridY);
    return Boolean(cell && cell.type !== "building");
  }
}
