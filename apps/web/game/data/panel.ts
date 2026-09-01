/**
 * Where the buttons sit on the car's panel.
 *
 * Data rather than positions written into the JSX, because two buttons landing
 * on the same spot is invisible in code and total in play: the player aims at
 * one and presses the other. The rows are laid out here so they can be checked.
 */

/** Face size of a button, in metres. Its housing is a third wider again. */
export const BUTTON_SIZE = 0.045;
export const BUTTON_FACE = BUTTON_SIZE * 1.35;

/** The plate they are mounted on. */
export const PLATE = { width: 0.17, height: 0.64, depth: 0.02 } as const;

/** Centre to centre. Anything less and two buttons touch. */
const PITCH = 0.072;
const TOP = 0.22;
/** The door pair sits side by side, the way a real one does. */
const SPREAD = 0.042;

export type PanelKind = "floor" | "offered" | "open" | "close";

export interface PanelRow {
  readonly id: string;
  readonly kind: PanelKind;
  /** The floor it calls, for the two kinds that call one. */
  readonly floor: number | null;
  readonly x: number;
  readonly y: number;
}

/**
 * The panel as it stands right now.
 *
 * The numbered buttons never change. The offered one appears under them once
 * the hotel has something to offer, and the door pair is always there and
 * always works: a lift the player can be shut inside with no way to open the
 * doors again is a lift that ends the run, and the panel is dead by design
 * from floor zero onwards.
 */
export function panelButtons(
  servedFloors: readonly number[],
  trapped: boolean,
  offered: number | null,
): PanelRow[] {
  const numbered = servedFloors.filter((floor) => floor >= 0);
  const rows: PanelRow[] = numbered.map((floor, index) => ({
    id: `floor-${floor}`,
    kind: "floor" as const,
    floor,
    x: 0,
    y: TOP - index * PITCH,
  }));

  if (trapped && offered !== null) {
    rows.push({
      id: "offered",
      kind: "offered",
      floor: offered,
      x: 0,
      y: TOP - numbered.length * PITCH,
    });
  }

  const doors = TOP - (numbered.length + 1) * PITCH;
  rows.push({ id: "open", kind: "open", floor: null, x: -SPREAD, y: doors });
  rows.push({ id: "close", kind: "close", floor: null, x: SPREAD, y: doors });
  return rows;
}
