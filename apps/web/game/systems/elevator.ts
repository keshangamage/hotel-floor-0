export type ElevatorPhase = "closed" | "opening" | "open" | "closing" | "travelling";

export interface ElevatorConfig {
  /** Seconds for the doors to travel their full stroke. */
  readonly openTime: number;
  /** Seconds the doors stay open before closing themselves. */
  readonly holdTime: number;
  /** Seconds of travel per floor. */
  readonly travelPerFloor: number;
  /** Floors that actually exist. Anything else is out of service. */
  readonly servedFloors: readonly number[];
}

export const ELEVATOR_CONFIG: ElevatorConfig = {
  openTime: 1.1,
  holdTime: 5,
  travelPerFloor: 2.4,
  // The whole descent, one floor at a time.
  servedFloors: [5, 4, 3, 2, 1, 0],
};

export interface ElevatorState {
  phase: ElevatorPhase;
  /** 0 shut, 1 fully open. */
  doors: number;
  floor: number;
  target: number | null;
  hold: number;
  travel: number;
  travelFrom: number;
}

export function createElevator(floor: number): ElevatorState {
  return { phase: "closed", doors: 0, floor, target: null, hold: 0, travel: 0, travelFrom: floor };
}

export function isServed(floor: number, config: ElevatorConfig): boolean {
  return config.servedFloors.includes(floor);
}

/** Call the car to the floor it is already on, or re-hold open doors. */
export function callElevator(state: ElevatorState, config: ElevatorConfig): void {
  if (state.phase === "closed" || state.phase === "closing") {
    state.phase = "opening";
  } else if (state.phase === "open") {
    state.hold = config.holdTime;
  }
}

export function closeDoors(state: ElevatorState): void {
  if (state.phase === "open" || state.phase === "opening") state.phase = "closing";
}

/** Returns false when the floor is not served, so the caller can say so. */
export function requestFloor(
  state: ElevatorState,
  floor: number,
  config: ElevatorConfig,
): boolean {
  if (!isServed(floor, config)) return false;
  if (floor === state.floor) {
    callElevator(state, config);
    return true;
  }
  state.target = floor;
  if (state.phase === "open" || state.phase === "opening") {
    state.phase = "closing";
  } else if (state.phase === "closed") {
    state.travelFrom = state.floor;
    state.travel = 0;
    state.phase = "travelling";
  }
  return true;
}

export function stepElevator(state: ElevatorState, dt: number, config: ElevatorConfig): void {
  switch (state.phase) {
    case "opening":
      state.doors = Math.min(1, state.doors + dt / config.openTime);
      if (state.doors >= 1) {
        state.phase = "open";
        state.hold = config.holdTime;
      }
      break;

    case "open":
      state.hold -= dt;
      if (state.hold <= 0) state.phase = "closing";
      break;

    case "closing":
      state.doors = Math.max(0, state.doors - dt / config.openTime);
      if (state.doors <= 0) {
        if (state.target !== null && state.target !== state.floor) {
          state.travelFrom = state.floor;
          state.travel = 0;
          state.phase = "travelling";
        } else {
          state.target = null;
          state.phase = "closed";
        }
      }
      break;

    case "travelling": {
      const distance = Math.abs((state.target ?? state.floor) - state.travelFrom);
      const duration = Math.max(0.001, distance * config.travelPerFloor);
      state.travel = Math.min(1, state.travel + dt / duration);
      if (state.travel >= 1) {
        state.floor = state.target ?? state.floor;
        state.target = null;
        state.phase = "opening";
      }
      break;
    }

    case "closed":
      break;
  }
}

/** What the readout shows, counting through floors while the car moves. */
export function displayFloor(state: ElevatorState): number {
  if (state.phase !== "travelling" || state.target === null) return state.floor;
  return Math.round(state.travelFrom + (state.target - state.travelFrom) * state.travel);
}
