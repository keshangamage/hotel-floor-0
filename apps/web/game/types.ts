/** Mutable tuple so these drop into R3F position/scale props. */
export type Vec3 = [number, number, number];

export type SurfaceKind =
  | "wall"
  | "floor"
  | "ceiling"
  | "door"
  | "trim"
  | "metal"
  | "wood"
  | "fabric"
  | "glass";

/** One axis-aligned box. The renderer draws these and collision reads the same array. */
export interface BoxSpec {
  readonly kind: SurfaceKind;
  readonly position: Vec3;
  /** Full extents, not half-extents. */
  readonly size: Vec3;
  readonly collides: boolean;
  /** false for collision-only boxes standing in for imported meshes. */
  readonly visible?: boolean;
}

/** Mutable point, reused in place so the movement loop allocates nothing. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounding box in world space. */
export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** A ceiling fixture. Shadow casters are opt-in because they are the main cost. */
export interface LampSpec {
  /** Set when the lamp can be switched or disturbed by an anomaly. */
  readonly id?: string;
  readonly position: Vec3;
  readonly castShadow: boolean;
  readonly intensity: number;
  /** "ceiling" is a recessed downlight, "bare" an omnidirectional bulb. */
  readonly kind?: "ceiling" | "bare";
  /** Unlit fixtures still render their housing, so they read as broken. */
  readonly lit?: boolean;
  readonly color?: string;
  readonly distance?: number;
}

/** A hinged door. Rendered as a component because it moves. */
export interface DoorSpec {
  readonly id: string;
  /** The jamb it pivots on. */
  readonly hinge: Vec3;
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly closedYaw: number;
  readonly openYaw: number;
  readonly locked: boolean;
  /** Room number, for prompts and signage. */
  readonly label?: string;
}

/** An instance of a prop from the imported model library. */
export interface PropSpec {
  readonly instanceId: string;
  /** Node name inside props.glb. */
  readonly id: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly scale?: number;
}

/** A framed picture hung flat on a corridor wall. */
export interface PaintingSpec {
  readonly id: string;
  /** Centre of the picture. */
  readonly position: Vec3;
  readonly side: 1 | -1;
  readonly width: number;
  readonly height: number;
  /** Index into the available artwork. */
  readonly art: number;
}

/** A wall switch controlling one lamp. */
export interface SwitchSpec {
  readonly id: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly targetLampId: string;
}

export interface RoomSpec {
  /** Displayed room number, e.g. 507. */
  readonly number: number;
  /** +1 for the +X wall, -1 for the -X wall. */
  readonly side: 1 | -1;
  /** Doorway centre along the corridor. */
  readonly doorZ: number;
  readonly width: number;
  readonly depth: number;
  /** Locked doors show a prompt but will not open. */
  readonly door: "unlocked" | "locked";
  /** Unlit rooms stay dark until the player brings a light. */
  readonly lit: boolean;
  /** Furnished rooms get a bed, desk, wardrobe and a window. */
  readonly furnished?: boolean;
}

/** One floor's plan, before it becomes geometry. */
export interface FloorSpec {
  readonly floorNumber: number;
  readonly seed: string;
  /**
   * The corridor runs from `from` to `to` along Z. `to` is fixed at the
   * elevator, so the car sits in the same place on every floor and the player
   * does not end up outside it when the floor changes.
   */
  readonly corridorFrom: number;
  readonly corridorTo: number;
  readonly rooms: readonly RoomSpec[];
  readonly lamps: readonly { readonly z: number; readonly castShadow: boolean; readonly lit: boolean }[];
  /** Room number the player starts inside, or null to start in the lobby. */
  readonly spawnRoom: number | null;
}

/** Everything needed to build one floor. */
export interface FloorLayout {
  readonly boxes: readonly BoxSpec[];
  readonly lamps: readonly LampSpec[];
  readonly doors: readonly DoorSpec[];
  readonly switches: readonly SwitchSpec[];
  readonly props: readonly PropSpec[];
  readonly paintings: readonly PaintingSpec[];
  /** Where the player's feet start. */
  readonly spawn: Vec3;
  /** Initial camera yaw, in radians. */
  readonly spawnYaw: number;
}
