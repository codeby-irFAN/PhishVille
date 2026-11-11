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
    this.keys = null;
    this.isPanning = false;
    this.lastPointer = { x: 0, y: 0 };
  }

  preload() {
    // These paths match PogiCity's public asset folder structure.
    this.load.image("city_grass", "/Tiles/1x1grass.png");
    this.load.image("city_road", "/Tiles/1x1square_tile.png");
    this.load.image("city_asphalt", "/Tiles/1x1asphalt_tile.png");
    this.load.image("city_snow_1", "/Tiles/1x1snow_tile_1.png");
    this.load.image("city_snow_2", "/Tiles/1x1snow_tile_2.png");
    this.load.image("city_snow_3", "/Tiles/1x1snow_tile_3.png");
  }

  async create() {
    this.cameras.main.setBackgroundColor("#9fbd8d");
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
      y: GRID_OFFSET_Y + (gridX + gridY) * (TILE_HEIGHT / 2),
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

    // Same 2:1 isometric grid dimensions and top padding used by PogiCity.
    this.worldWidth = Math.ceil((cols + rows) * HALF_TILE_WIDTH) + TILE_WIDTH * 4;
    this.worldHeight = Math.ceil((cols + rows) * (TILE_HEIGHT / 2)) + 400;
    this.gridOffsetX = this.worldWidth / 2;

    // Draw every ground tile first. Depth sorting keeps the isometric order correct.
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
    const decorationSortY = GRID_OFFSET_Y + balancedGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
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
        const sliceSortY = GRID_OFFSET_Y + sliceGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
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
        const sliceSortY = GRID_OFFSET_Y + sliceGridSum * (TILE_HEIGHT / 2) + TILE_HEIGHT / 2;
        slice.setDepth(this.depthFromSortPoint(screenPosition.x, sliceSortY, 0.05));
      }
    }
  }

  setupCameraAndControls() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldWidth, this.worldHeight);

    const fitZoom = Math.min(
      this.scale.width / this.worldWidth,
      this.scale.height / this.worldHeight
    ) * 0.92;
    camera.setZoom(fitZoom);
    camera.centerOn(this.worldWidth / 2, this.worldHeight / 2);

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

    this.input.on("wheel", (_pointer, _objects, _deltaX, deltaY) => {
      const nextZoom = Phaser.Math.Clamp(
        camera.zoom * (deltaY > 0 ? 0.9 : 1.1),
        fitZoom * 0.65,
        1.2
      );
      camera.setZoom(nextZoom);
    });

    // Drag the mouse to look around the city (gameplay clicks can be added later).
    this.input.on("pointerdown", (pointer) => {
      this.isPanning = true;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });
    this.input.on("pointerup", () => { this.isPanning = false; });
    this.input.on("pointerupoutside", () => { this.isPanning = false; });
    this.input.on("pointermove", (pointer) => {
      if (!this.isPanning || !pointer.isDown) return;
      camera.scrollX -= (pointer.x - this.lastPointer.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPointer.y) / camera.zoom;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });
  }

  update(_time, delta) {
    if (!this.keys) return;
    const camera = this.cameras.main;
    const speed = (500 * delta) / 1000 / camera.zoom;

    if (this.keys.left.isDown || this.keys.arrowLeft.isDown) camera.scrollX -= speed;
    if (this.keys.right.isDown || this.keys.arrowRight.isDown) camera.scrollX += speed;
    if (this.keys.up.isDown || this.keys.arrowUp.isDown) camera.scrollY -= speed;
    if (this.keys.down.isDown || this.keys.arrowDown.isDown) camera.scrollY += speed;
  }

  getCell(gridX, gridY) {
    return this.grid[gridY]?.[gridX] || null;
  }

  isWalkableTile(gridX, gridY) {
    const cell = this.getCell(gridX, gridY);
    return Boolean(cell && cell.type !== "building");
  }
}
