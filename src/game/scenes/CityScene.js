import Phaser from "phaser";
import { BUILDINGS, getBuildingFootprint } from "../data/buildings";
import { STUDY_LESSONS } from "../data/studyLessons";

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

// A natural outskirts ring gives the camera a little breathing room.
// The perimeter fog hides its edge instead of fading individual checkerboard tiles.
const EDGE_PADDING_TILES = 8;
const PERIMETER_FOG_DEPTH = 210;
const PERIMETER_FOG_ALPHA = 0.92;
const OUTSKIRT_TINT = 0x829675;
const GROUND_LIGHT_TINT = 0xfff5e4;

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
    this.perimeterFog = [];
    this.sunlightLayers = [];
    this.keys = null;
    this.isPanning = false;
    this.lastPointer = { x: 0, y: 0 };
    this.player = null;
    this.playerFacingRow = 0;
    this.playerFlipX = false;
    this.controlHint = null;
    this.isDraggingCamera = false;
    this.isStudyMode = false;
    this.studyLesson = null;
    this.studyStepIndex = 0;
    this.studyNpcs = [];
    this.studyHudText = null;
    this.studyProgressText = null;
    this.studyDialoguePanel = null;
    this.studyDialogueName = null;
    this.studyDialogueText = null;
    this.studyDialogueHint = null;
    this.studyInteractPrompt = null;
    this.studyWaypoint = null;
    this.studyDialogueOpen = false;
    this.studyPendingReturn = false;
    this.studyInteractKey = null;
  }

  init(data = {}) {
    this.isStudyMode = data.studyMode === true;
    this.studyLessonId = data.lessonId || null;
    this.studyStepIndex = Number.isInteger(data.stepIndex) ? data.stepIndex : 0;
    this.studyNpcs = [];
    this.studyWaypoint = null;
    this.studyDialogueOpen = false;
    this.studyPendingReturn = false;
    this.studyHudText = null;
    this.studyProgressText = null;
    this.studyDialoguePanel = null;
    this.studyDialogueName = null;
    this.studyDialogueText = null;
    this.studyDialogueHint = null;
    this.studyInteractPrompt = null;
    this.studyInteractKey = null;
    this.player = null;
    this.keys = null;
    this.isPanning = false;
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
    if (!this.textures.exists("phishville_character_walk")) {
      this.load.spritesheet(
        "phishville_character_walk",
        "/assets/characters/Character0/Character0_Walk.png",
        { frameWidth: CHARACTER_FRAME_SIZE, frameHeight: CHARACTER_FRAME_SIZE }
      );
    }
    if (!this.textures.exists("phishville_character_idle")) {
      this.load.spritesheet(
        "phishville_character_idle",
        "/assets/characters/Character0/Character0_Idle.png",
        { frameWidth: CHARACTER_FRAME_SIZE, frameHeight: CHARACTER_FRAME_SIZE }
      );
    }
  }

  async create() {
    this.isStudyMode = this.isStudyMode || this.registry.get("phishvilleMode") === "study";
    this.studyLessonId = this.studyLessonId || this.registry.get("studyCurrentLessonId") || null;
    this.studyStepIndex = this.registry.get("studyMissionStep") ?? this.studyStepIndex;
    this.cameras.main.setBackgroundColor("#b8d8e7");
    this.cityTitleText = this.add.text(18, 14, "PHISHVILLE", {
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
        if (this.isStudyMode) this.setupStudyMode();
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

    // Draw a muted, continuous-looking outskirts ring. It stays fully opaque;
    // the atmospheric fog is responsible for concealing the world boundary.
    for (let y = -EDGE_PADDING_TILES; y < rows + EDGE_PADDING_TILES; y++) {
      for (let x = -EDGE_PADDING_TILES; x < cols + EDGE_PADDING_TILES; x++) {
        const isInsideMap = x >= 0 && x < cols && y >= 0 && y < rows;
        if (isInsideMap || !this.textures.exists("city_grass")) continue;

        const position = this.gridToWorld(x, y);
        this.add.image(position.x, position.y, "city_grass")
          .setOrigin(0.5, 0)
          .setScale(1.02)
          .setTint(OUTSKIRT_TINT)
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
          .setTint(GROUND_LIGHT_TINT)
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

    this.createSoftLighting();
    this.createPerimeterFog(cols, rows);
    this.createCharacterAnimations();
    this.spawnPlayer();
  }

  createSoftLighting() {
    const textureKey = "phishville_soft_sunlight";
    if (!this.textures.exists(textureKey)) {
      const texture = this.textures.createCanvas(textureKey, 512, 512);
      const context = texture.getContext();
      const gradient = context.createRadialGradient(256, 256, 18, 256, 256, 256);
      gradient.addColorStop(0, "rgba(255, 220, 158, 0.30)");
      gradient.addColorStop(0.38, "rgba(255, 226, 177, 0.17)");
      gradient.addColorStop(0.72, "rgba(255, 232, 196, 0.055)");
      gradient.addColorStop(1, "rgba(255, 238, 214, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      texture.refresh();
    }

    // Warm sunlight pools sit just above the ground layer and below buildings
    // and the player, so they brighten the environment without washing out art.
    const lightSpots = [
      { x: 9, y: 13, size: 590, alpha: 0.74 },
      { x: 33, y: 30, size: 650, alpha: 0.60 },
      { x: 23, y: 43, size: 520, alpha: 0.46 },
    ];

    for (const spot of lightSpots) {
      const position = this.gridToWorld(spot.x, spot.y);
      const light = this.add.image(position.x, position.y, textureKey)
        .setOrigin(0.5)
        .setDisplaySize(spot.size, spot.size)
        .setAlpha(spot.alpha)
        .setDepth(this.depthFromSortPoint(position.x, position.y, 0.025));
      this.sunlightLayers.push(light);
    }

    // A very light warm ambient wash unifies the city palette.
    const ambient = this.add.rectangle(
      this.worldWidth / 2,
      this.worldHeight / 2,
      this.worldWidth,
      this.worldHeight,
      0xffe8c8,
      0.035
    );
    ambient.setDepth(30000000);
    this.sunlightLayers.push(ambient);
  }

  createPerimeterFog(cols, rows) {
    const textureKey = "phishville_perimeter_fog";
    if (!this.textures.exists(textureKey)) {
      const texture = this.textures.createCanvas(textureKey, 512, 512);
      const context = texture.getContext();

      // Fog is densest at the outer boundary and thins gently into the city.
      const gradient = context.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, "rgba(207, 224, 216, 0.88)");
      gradient.addColorStop(0.12, "rgba(207, 224, 216, 0.72)");
      gradient.addColorStop(0.34, "rgba(211, 227, 220, 0.40)");
      gradient.addColorStop(0.62, "rgba(216, 230, 224, 0.15)");
      gradient.addColorStop(1, "rgba(216, 230, 224, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);

      // Uneven soft puffs break up the straight edge, giving the fog a natural shape.
      const puffs = [
        [42, 76, 68, 0.30], [118, 138, 86, 0.26], [205, 62, 76, 0.24],
        [292, 154, 92, 0.28], [394, 88, 72, 0.24], [475, 178, 76, 0.20],
        [72, 250, 68, 0.13], [346, 278, 82, 0.12],
      ];
      for (const [x, y, radius, alpha] of puffs) {
        const puff = context.createRadialGradient(x, y, 2, x, y, radius);
        puff.addColorStop(0, `rgba(229, 239, 232, ${alpha})`);
        puff.addColorStop(1, "rgba(229, 239, 232, 0)");
        context.fillStyle = puff;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      texture.refresh();
    }

    const min = -EDGE_PADDING_TILES;
    const maxX = cols + EDGE_PADDING_TILES - 1;
    const maxY = rows + EDGE_PADDING_TILES - 1;
    const corners = [
      this.gridToWorld(min, min),
      this.gridToWorld(maxX, min),
      this.gridToWorld(maxX, maxY),
      this.gridToWorld(min, maxY),
    ];
    const center = this.gridToWorld((min + maxX) / 2, (min + maxY) / 2);

    for (let i = 0; i < corners.length; i++) {
      const start = corners[i];
      const end = corners[(i + 1) % corners.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

      // The ordered corners run around the diamond; local +Y points inward.
      // Shift the strip half a tile outward so it covers the outer tile corners.
      let inwardX = -dy / length;
      let inwardY = dx / length;
      const towardCenterX = center.x - midpoint.x;
      const towardCenterY = center.y - midpoint.y;
      if (inwardX * towardCenterX + inwardY * towardCenterY < 0) {
        inwardX *= -1;
        inwardY *= -1;
      }

      const tileEdgeProjection = Math.abs(inwardX) * HALF_TILE_WIDTH +
        Math.abs(inwardY) * (TILE_HEIGHT / 2);
      const edgePosition = {
        x: midpoint.x - inwardX * tileEdgeProjection,
        y: midpoint.y - inwardY * tileEdgeProjection,
      };

      // If corner order ever changes, rotate to keep the fog's vertical axis inward.
      const fogRotation = Math.atan2(-inwardX, inwardY);
      const fog = this.add.image(edgePosition.x, edgePosition.y, textureKey)
        .setOrigin(0.5, 0)
        .setRotation(fogRotation)
        .setDisplaySize(length + 100, PERIMETER_FOG_DEPTH)
        .setAlpha(PERIMETER_FOG_ALPHA)
        .setDepth(50000000 + i);
      this.perimeterFog.push(fog);
    }

    // Round fog puffs soften the four sharp diamond tips.
    const puffKey = "phishville_fog_corner_puff";
    if (!this.textures.exists(puffKey)) {
      const puffTexture = this.textures.createCanvas(puffKey, 256, 256);
      const puffContext = puffTexture.getContext();
      const puffGradient = puffContext.createRadialGradient(128, 128, 8, 128, 128, 128);
      puffGradient.addColorStop(0, "rgba(215, 230, 221, 0.76)");
      puffGradient.addColorStop(0.42, "rgba(215, 230, 221, 0.40)");
      puffGradient.addColorStop(0.78, "rgba(215, 230, 221, 0.12)");
      puffGradient.addColorStop(1, "rgba(215, 230, 221, 0)");
      puffContext.fillStyle = puffGradient;
      puffContext.fillRect(0, 0, 256, 256);
      puffTexture.refresh();
    }
    for (const point of corners) {
      const puff = this.add.image(point.x, point.y, puffKey)
        .setDisplaySize(360, 360)
        .setAlpha(0.74)
        .setDepth(50000010);
      this.perimeterFog.push(puff);
    }
  }

  createSkyBackdrop() {
    const textureKey = "phishville_sky_gradient";
    if (!this.textures.exists(textureKey)) {
      const texture = this.textures.createCanvas(textureKey, 512, 512);
      const context = texture.getContext();
      const gradient = context.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, "#82b9df");
      gradient.addColorStop(0.42, "#b8d7e5");
      gradient.addColorStop(0.74, "#dce5db");
      gradient.addColorStop(1, "#f0dfc6");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      texture.refresh();
    }

    this.skyBackdrop = this.add.image(0, 0, textureKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2000000000);
    this.resizeSkyBackdrop(this.scale.width, this.scale.height);

    // Gentle sun bloom in the upper sky, kept soft so it does not compete with play.
    const sunKey = "phishville_sky_sun_bloom";
    if (!this.textures.exists(sunKey)) {
      const sunTexture = this.textures.createCanvas(sunKey, 256, 256);
      const sunContext = sunTexture.getContext();
      const sunGradient = sunContext.createRadialGradient(128, 128, 4, 128, 128, 128);
      sunGradient.addColorStop(0, "rgba(255, 246, 218, 0.48)");
      sunGradient.addColorStop(0.28, "rgba(255, 235, 190, 0.24)");
      sunGradient.addColorStop(0.68, "rgba(255, 230, 190, 0.07)");
      sunGradient.addColorStop(1, "rgba(255, 230, 190, 0)");
      sunContext.fillStyle = sunGradient;
      sunContext.fillRect(0, 0, 256, 256);
      sunTexture.refresh();
    }
    this.add.image(this.scale.width * 0.78, this.scale.height * 0.16, sunKey)
      .setDisplaySize(360, 360)
      .setScrollFactor(0)
      .setDepth(-1999999999);

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
    for (let row = 0; row < 5; row++) {
      const idleKey = `character_idle_${row}`;
      const walkKey = `character_walk_${row}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers("phishville_character_idle", {
            start: row * 8,
            end: row * 8 + 7,
          }),
          frameRate: 5,
          repeat: -1,
        });
      }
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
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

    // Study Mode begins outside the Cyber Academy; Story Mode keeps its
    // original residential-area spawn.
    const spawn = this.isStudyMode ? { x: 20, y: 35 } : this.findSpawnTile(2, 3);
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

  update(time, delta) {
    this.updatePlayer(delta);
    if (this.isStudyMode) {
      if (this.studyInteractKey && Phaser.Input.Keyboard.JustDown(this.studyInteractKey)) {
        this.handleStudyInteract();
      }
      this.updateStudyMode(time);
    }
  }

  getCell(gridX, gridY) {
    return this.grid[gridY]?.[gridX] || null;
  }

  isWalkableTile(gridX, gridY) {
    const cell = this.getCell(gridX, gridY);
    return Boolean(cell && cell.type !== "building");
  }

  // --------------------------- STUDY MODE ---------------------------

  setupStudyMode() {
    this.studyLesson = STUDY_LESSONS.find((lesson) => lesson.id === this.studyLessonId);
    if (!this.studyLesson) {
      console.error("Study Mode lesson not found:", this.studyLessonId);
      return;
    }

    // Replace compact Story Mode overlays with the Study Mode city HUD.
    this.controlHint?.destroy();
    this.cityTitleText?.destroy();
    this.studyInteractKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.createStudyLandmarkLabels();
    this.createStudyNpcs();
    this.createStudyHud();
    this.createStudyDialogue();
    this.createStudyWaypoint();
  }

  createCityCard(x, y, width, height, headerText) {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xf8f1df, 0.97);
    graphics.lineStyle(2, 0x355940, 1);
    graphics.fillRoundedRect(x, y, width, height, 10);
    graphics.strokeRoundedRect(x, y, width, height, 10);
    graphics.fillStyle(0x355940, 1);
    graphics.fillRoundedRect(x, y, width, 28, 8);
    graphics.fillRect(x, y + 18, width, 10);
    graphics.setScrollFactor(0).setDepth(1000000000);
    this.add.text(x + 12, y + 6, headerText, {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fff4d9",
      letterSpacing: 1,
    }).setScrollFactor(0).setDepth(1000000001);
    return graphics;
  }

  createStudyHud() {
    this.createCityCard(16, 16, 300, 82, "CONTROLS  /  FIELD GUIDE");
    this.add.text(30, 53, "[ W A S D ]  or  [ ARROWS ]   MOVE\n[ E ]   TALK  /  INTERACT", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#2d4735",
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(1000000001);

    this.createCityCard(16, 108, 320, 226, `STUDY TASK  ${this.studyLesson.number} / 02`);
    this.add.text(30, 145, this.studyLesson.title, {
      fontFamily: "Arial, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#294a36",
      wordWrap: { width: 288 },
    }).setScrollFactor(0).setDepth(1000000001);

    this.studyProgressText = this.add.text(30, 180, "STEP 1 OF 3", {
      fontFamily: "Arial, sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#a66c25",
    }).setScrollFactor(0).setDepth(1000000001);

    this.studyHudText = this.add.text(30, 200, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      color: "#3b4c3d",
      lineSpacing: 8,
      wordWrap: { width: 286 },
    }).setScrollFactor(0).setDepth(1000000001);
    this.refreshStudyHud();

    this.studyInteractPrompt = this.add.text(this.scale.width / 2, this.scale.height - 28, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#fff6df",
      backgroundColor: "#294b38",
      padding: { x: 12, y: 7 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1000000002).setVisible(false);

    this.scale.on("resize", (size) => {
      this.studyInteractPrompt?.setPosition(size.width / 2, size.height - 28);
      if (this.studyDialoguePanel) {
        this.studyDialoguePanel.setPosition(350, size.height - 164);
      }
    });
  }

  refreshStudyHud() {
    if (!this.studyLesson || !this.studyHudText || !this.studyProgressText) return;
    const lines = this.studyLesson.steps.map((step, index) => {
      const marker = index < this.studyStepIndex ? "✓" : index === this.studyStepIndex ? "◆" : "○";
      const prefix = index === this.studyStepIndex ? "NOW  " : "      ";
      return `${marker} ${prefix}${step.title}`;
    });
    this.studyProgressText.setText(
      this.studyStepIndex >= this.studyLesson.steps.length
        ? "TASK COMPLETE"
        : `STEP ${this.studyStepIndex + 1} OF ${this.studyLesson.steps.length}`
    );
    this.studyHudText.setText(lines.join("\n\n"));
  }

  createStudyLandmarkLabels() {
    for (const landmark of this.studyLesson.landmarks) {
      const point = this.gridToWorld(landmark.tile.x, landmark.tile.y);
      this.add.text(point.x, point.y - 26, landmark.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#fff6dc",
        backgroundColor: "#294b38",
        padding: { x: 7, y: 4 },
        stroke: "#1b3325",
        strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(this.depthFromSortPoint(point.x, point.y, 0.28)).setY(point.y - 52);
    }
  }

  createStudyNpcs() {
    if (!this.textures.exists("phishville_character_idle")) return;

    for (let index = 0; index < this.studyLesson.steps.length; index++) {
      const step = this.studyLesson.steps[index];
      const point = this.gridToWorld(step.tile.x, step.tile.y);
      this.add.ellipse(point.x, point.y + 7, 26, 9, 0x28362b, 0.22)
        .setDepth(this.depthFromSortPoint(point.x, point.y, 0.1));
      const sprite = this.add.sprite(point.x, point.y + 7, "phishville_character_idle", 0)
        .setOrigin(0.5, 0.93)
        .setScale(CHARACTER_SCALE)
        .setTint(step.tint || 0xffffff)
        .setDepth(this.depthFromSortPoint(point.x, point.y + 7, 0.22));
      sprite.play(`character_idle_${index % 5}`);

      this.add.text(point.x, point.y - 34, `${step.npcName}  •  ${step.role}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#263f30",
        backgroundColor: "#fff4dc",
        padding: { x: 6, y: 4 },
        stroke: "#ffffff",
        strokeThickness: 1,
      }).setOrigin(0.5, 1).setDepth(this.depthFromSortPoint(point.x, point.y, 0.25));

      this.studyNpcs.push({
        stepIndex: index,
        sprite,
        x: point.x,
        y: point.y + 7,
        name: step.npcName,
        role: step.role,
        step,
      });
    }
  }

  createStudyWaypoint() {
    this.studyWaypoint?.forEach((item) => item.destroy());
    this.studyWaypoint = null;
    const step = this.studyLesson.steps[this.studyStepIndex];
    if (!step) return;

    const point = this.gridToWorld(step.tile.x, step.tile.y);
    const baseY = point.y + 4;
    const depth = this.depthFromSortPoint(point.x, baseY, 0.24);
    const beam = this.add.rectangle(point.x, baseY - 38, 4, 68, 0xffd56c, 0.34).setDepth(depth - 1);
    const orb = this.add.circle(point.x, baseY - 76, 10, 0xffd56c, 0.98)
      .setStrokeStyle(3, 0xfff1bd, 1).setDepth(depth + 2);
    const core = this.add.circle(point.x, baseY - 76, 4, 0xffffff, 1).setDepth(depth + 3);
    const ring = this.add.ellipse(point.x, baseY + 3, 38, 15, 0xffd56c, 0.16)
      .setStrokeStyle(2, 0xffd56c, 0.9).setDepth(depth + 1);
    this.studyWaypoint = { beam, orb, core, ring, baseY };
  }

  createStudyDialogue() {
    const x = 350;
    const y = this.scale.height - 164;
    const width = Math.max(420, this.scale.width - 370);
    const height = 142;
    const panel = this.add.graphics();
    panel.fillStyle(0xf8f1df, 0.98).lineStyle(3, 0x355940, 1);
    panel.fillRoundedRect(x, y, width, height, 12);
    panel.strokeRoundedRect(x, y, width, height, 12);
    panel.fillStyle(0x355940, 1).fillRoundedRect(x, y, width, 30, 9);
    panel.fillRect(x, y + 20, width, 10);
    panel.setScrollFactor(0).setDepth(1000000003).setVisible(false);

    this.studyDialoguePanel = panel;
    this.studyDialogueName = this.add.text(x + 14, y + 7, "", {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#fff4dc",
    }).setScrollFactor(0).setDepth(1000000004).setVisible(false);
    this.studyDialogueText = this.add.text(x + 18, y + 43, "", {
      fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#334738",
      lineSpacing: 5, wordWrap: { width: width - 36 },
    }).setScrollFactor(0).setDepth(1000000004).setVisible(false);
    this.studyDialogueHint = this.add.text(x + width - 14, y + height - 24, "[ E ] CONTINUE", {
      fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", color: "#9b6b2c",
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(1000000004).setVisible(false);
  }

  showStudyDialogue(name, text, hint = "[ E ] CONTINUE") {
    if (!this.studyDialoguePanel) this.createStudyDialogue();
    this.studyDialoguePanel.setVisible(true);
    this.studyDialogueName.setVisible(true).setText(name);
    this.studyDialogueText.setVisible(true).setText(text);
    this.studyDialogueHint.setVisible(true).setText(hint);
    this.studyDialogueOpen = true;
    this.studyInteractPrompt?.setVisible(false);
  }

  hideStudyDialogue() {
    this.studyDialoguePanel?.setVisible(false);
    this.studyDialogueName?.setVisible(false);
    this.studyDialogueText?.setVisible(false);
    this.studyDialogueHint?.setVisible(false);
    this.studyDialogueOpen = false;
  }

  getActiveStudyNpc() {
    return this.studyNpcs.find((npc) => npc.stepIndex === this.studyStepIndex) || null;
  }

  updateStudyMode(time) {
    if (this.studyWaypoint) {
      const bob = Math.sin(time / 220) * 8;
      const { beam, orb, core, ring, baseY } = this.studyWaypoint;
      beam.setY(baseY - 38 + bob * 0.35);
      orb.setY(baseY - 76 + bob);
      core.setY(baseY - 76 + bob);
      ring.setScale(1 + Math.sin(time / 260) * 0.12);
      ring.setAlpha(0.62 + Math.sin(time / 260) * 0.22);
    }

    if (this.studyDialogueOpen || !this.player) return;
    const npc = this.getActiveStudyNpc();
    if (!npc) return;
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
    const close = distance < 66;
    this.studyInteractPrompt?.setVisible(close).setText(close ? `[ E ] TALK TO ${npc.name.toUpperCase()}` : "");
  }

  handleStudyInteract() {
    if (!this.isStudyMode || !this.studyLesson) return;

    if (this.studyDialogueOpen) {
      this.continueStudyDialogue();
      return;
    }

    const npc = this.getActiveStudyNpc();
    if (!npc || !this.player) return;
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
    if (distance > 66) return;

    const step = npc.step;
    this.showStudyDialogue(`${step.npcName}  •  ${step.role}`, `${step.dialogue}\n\n${step.response}`);
  }

  continueStudyDialogue() {
    if (this.studyPendingReturn) {
      this.scene.start("ClassroomScene", { completedConcept: this.studyLesson.id });
      return;
    }

    this.hideStudyDialogue();
    this.studyStepIndex += 1;
    this.registry.set("studyMissionStep", this.studyStepIndex);

    if (this.studyStepIndex >= this.studyLesson.steps.length) {
      const completed = this.registry.get("studyCompletedConcepts") || [];
      if (!completed.includes(this.studyLesson.id)) {
        this.registry.set("studyCompletedConcepts", [...completed, this.studyLesson.id]);
      }
      this.studyPendingReturn = true;
      this.studyWaypoint?.forEach((item) => item.destroy());
      this.studyWaypoint = null;
      this.studyInteractPrompt?.setVisible(false);
      this.refreshStudyHud();
      this.showStudyDialogue(
        "FIELD TASK COMPLETE  •  WELL DONE!",
        "You completed the city task and used the safety checks from your classroom lesson. Return to the Cyber Academy to unlock the next concept.",
        "[ E ] RETURN TO CLASSROOM"
      );
      return;
    }

    this.refreshStudyHud();
    this.createStudyWaypoint();
  }

}
