import { RenderTexture, Renderer } from 'pixi.js';

interface Vec2 {
    x: number;
    y: number;
}
interface Bounds {
    width: number;
    height: number;
}
interface AABB {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
type SeatStatus = "available" | "held" | "sold" | "blocked";
interface PricingCategory {
    id: string;
    name: string;
    color: string;
}
interface Seat {
    id: string;
    label: string;
    position: Vec2;
    status: SeatStatus;
    categoryId: string;
}
interface Row {
    id: string;
    label: string;
    seats: Seat[];
}
interface Section {
    id: string;
    label: string;
    position: Vec2;
    rotation: number;
    categoryId: string;
    rows: Row[];
    outline: Vec2[];
}
interface GeneralAdmissionArea {
    id: string;
    label: string;
    shape: Vec2[];
    capacity: number;
    categoryId: string;
}
interface Table {
    id: string;
    label: string;
    position: Vec2;
    shape: "round" | "rectangular";
    seats: Seat[];
    categoryId: string;
}
interface Venue {
    id: string;
    name: string;
    bounds: Bounds;
    backgroundImage?: string;
    backgroundImageOpacity?: number;
    sections: Section[];
    gaAreas: GeneralAdmissionArea[];
    tables: Table[];
    categories: PricingCategory[];
}

declare function seatWorldPosition(section: Section, seat: Seat): Vec2;
declare function sectionAABB(section: Section): AABB;
declare function venueAABB(venue: Venue): AABB;
/** Ray-casting point-in-polygon test. Works with any simple polygon. */
declare function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean;
/** Clamp a point to the nearest position inside a polygon (with margin). */
declare function clampToPolygon(point: Vec2, polygon: Vec2[], margin?: number): Vec2;
declare function generateId(prefix?: string): string;

interface SpatialItem extends AABB {
    type: "section" | "seat";
    sectionId: string;
    seatId?: string;
}
declare class SpatialIndex {
    private tree;
    private items;
    buildFromSections(sections: Section[]): void;
    queryViewport(viewport: AABB): SpatialItem[];
    queryPoint(point: Vec2, radius?: number): SpatialItem[];
    queryRect(rect: AABB): SpatialItem[];
}

interface ViewportState {
    x: number;
    y: number;
    zoom: number;
}
declare class Viewport {
    x: number;
    y: number;
    zoom: number;
    screenWidth: number;
    screenHeight: number;
    private listeners;
    setScreenSize(width: number, height: number): void;
    pan(dx: number, dy: number): void;
    zoomAt(screenPoint: Vec2, factor: number): void;
    setZoom(zoom: number): void;
    fitBounds(aabb: AABB, padding?: number): void;
    screenToWorld(screenX: number, screenY: number): Vec2;
    worldToScreen(worldX: number, worldY: number): Vec2;
    getVisibleAABB(): AABB;
    getState(): ViewportState;
    subscribe(listener: () => void): () => void;
    private notify;
}

declare enum LODLevel {
    Overview = "overview",
    Section = "section",
    Detail = "detail"
}
declare function getLODLevel(zoom: number): LODLevel;

interface SeatTextureSet {
    available: RenderTexture;
    held: RenderTexture;
    sold: RenderTexture;
    blocked: RenderTexture;
    selected: RenderTexture;
    hovered: RenderTexture;
}
declare function createSeatTextures(renderer: Renderer, radius?: number, categoryColor?: number, textureResolution?: number): SeatTextureSet;
declare function destroySeatTextures(textures: SeatTextureSet): void;

declare class CategoryTextureCache {
    private cache;
    private defaultTextures;
    create(renderer: Renderer, categories: {
        id: string;
        color: string;
    }[], seatRadius?: number): void;
    get(categoryId: string): SeatTextureSet;
    destroy(): void;
}

interface Command {
    execute(): void;
    undo(): void;
    description: string;
}
declare class CommandHistory {
    private undoStack;
    private redoStack;
    private listeners;
    execute(command: Command): void;
    undo(): void;
    redo(): void;
    get canUndo(): boolean;
    get canRedo(): boolean;
    clear(): void;
    subscribe(listener: () => void): () => void;
    private notify;
}

declare function serializeVenue(venue: Venue): string;
declare function deserializeVenue(json: string): Venue;

export { type AABB, type Bounds, CategoryTextureCache, type Command, CommandHistory, type GeneralAdmissionArea, LODLevel, type PricingCategory, type Row, type Seat, type SeatStatus, type SeatTextureSet, type Section, SpatialIndex, type SpatialItem, type Table, type Vec2, type Venue, Viewport, type ViewportState, clampToPolygon, createSeatTextures, deserializeVenue, destroySeatTextures, generateId, getLODLevel, pointInPolygon, seatWorldPosition, sectionAABB, serializeVenue, venueAABB };
