import { GUEST_KEY, buildFloor, roomCentre } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";
import { CORRIDOR_HALF_WIDTH, WALL_THICKNESS } from "../game/data/dimensions";

/** Outer face of the corridor wall, which is where a room begins. */
const OUTER_X = CORRIDOR_HALF_WIDTH + WALL_THICKNESS;

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const SEEDS = ["night-porter", "quiet-seed", "a", "b", "c", "d"];
const FLOORS = [5, 4, 3, 2, 1, -1, -2, -3];

// A second room, and the same one on every floor. Anything that differs
// between floors is an anomaly the player is asked to spot, and a room that
// could be opened on five and not on four is a difference they cannot act on.
{
  let wandering = "";
  for (const seed of SEEDS) {
    const keyed = FLOORS.map((f) => {
      const room = generateFloor(f, seed).rooms.find((r) => r.keyed);
      // Numbering changes by floor, so compare the door's place, not its name.
      return room ? `${room.side}@${room.doorZ}` : "none";
    });
    if (new Set(keyed).size !== 1) wandering += ` ${seed}: ${[...new Set(keyed)].join(", ")};`;
  }
  check("the locked room is in the same place on every floor", wandering === "",
    wandering || `${SEEDS.length} hotels`);
}

// It has to be a room that is actually shut, and not the one already standing
// open, or the key opens nothing.
{
  let wrong = "";
  for (const seed of SEEDS) {
    const rooms = generateFloor(5, seed).rooms;
    const keyed = rooms.find((r) => r.keyed);
    if (!keyed) { wrong += ` ${seed}: none;`; continue; }
    if (keyed.door !== "locked") wrong += ` ${seed}: ${keyed.number} is not locked;`;
    if (keyed.furnished) wrong += ` ${seed}: ${keyed.number} is the open one;`;
    if (rooms.filter((r) => r.keyed).length !== 1) wrong += ` ${seed}: more than one;`;
  }
  check("it is locked, and it is not the room already open", wrong === "", wrong || "six hotels");
}

// One key for the whole hotel, not one per floor. It is found once and keeps
// working all the way down, which is why the door names what opens it instead
// of the key naming the door: that room is 503 on the fifth floor and 403 on
// the fourth, and it is the same room and the same key.
{
  let broken = "";
  const ids = new Set<string>();
  for (const seed of SEEDS) {
    for (const floor of FLOORS) {
      const spec = generateFloor(floor, seed);
      const layout = buildFloor(spec);
      const keyed = spec.rooms.find((r) => r.keyed)!;
      const key = layout.items.find((i) => i.id === GUEST_KEY);
      // Unless the floor's fault is that the key is not where it is left.
      if (!key) {
        if (spec.anomaly?.kind !== "key-gone") broken += ` ${seed}/${floor}: no key;`;
        continue;
      }
      for (const item of layout.items) if (item.keep) ids.add(item.id);

      const door = layout.doors.find((d) => d.id === `room-${keyed.number}`);
      if (!door) broken += ` ${seed}/${floor}: the locked room has no door;`;
      else if (!door.locked) broken += ` ${seed}/${floor}: ${door.id} was never locked;`;
      else if (door.needs !== GUEST_KEY) broken += ` ${seed}/${floor}: ${door.id} needs ${door.needs};`;

      // And no other door will take it, or the key opens the whole corridor.
      const others = layout.doors.filter((d) => d.needs !== undefined && d.id !== `room-${keyed.number}`);
      if (others.length > 0) broken += ` ${seed}/${floor}: ${others.length} extra doors take a key;`;
    }
  }
  check("every floor has a key, and it opens the locked room", broken === "",
    broken || `${SEEDS.length * FLOORS.length} floors`);
  // The same things to pick up on every floor, and the key among them. A floor
  // carrying something the others do not would be a difference the player is
  // asked to spot and cannot act on.
  check("and every floor offers the same things to pick up",
    ids.has(GUEST_KEY) && ids.size === 2, [...ids].sort().join(", ") || "none");
}

// Left where the player can reach it: on a surface, inside the room that is
// open. A key in the locked room would be a locked room with its own key in it.
{
  let unreachable = "";
  for (const seed of SEEDS) {
    const spec = generateFloor(5, seed);
    const layout = buildFloor(spec);
    const key = layout.items.find((i) => i.id === GUEST_KEY);
    if (!key) continue;
    const open = spec.rooms.find((r) => r.furnished)!;
    const middle = roomCentre(open);
    const inside = Math.abs(key.position[2] - middle[2]) <= open.width / 2
      && Math.sign(key.position[0]) === open.side
      && Math.abs(key.position[0]) > OUTER_X;
    if (!inside) unreachable += ` ${seed}: key at ${key.position.map((n) => n.toFixed(1)).join(",")};`;
    if (key.position[1] < 0.3) unreachable += ` ${seed}: on the floor, not a surface;`;
  }
  check("the key is on a surface in the room that is open", unreachable === "",
    unreachable || "six hotels");
}

// And there is something behind the door, or the key is a chore.
{
  let empty = "";
  for (const seed of SEEDS) {
    const spec = generateFloor(5, seed);
    const layout = buildFloor(spec);
    const keyed = spec.rooms.find((r) => r.keyed)!;
    const middle = roomCentre(keyed);
    const page = layout.notes.find((n) => n.id === "kept-note");
    if (!page) { empty += ` ${seed}: nothing in it;`; continue; }
    if (Math.hypot(page.position[0] - middle[0], page.position[2] - middle[2]) > 0.01) {
      empty += ` ${seed}: the page is not in the locked room;`;
    }
  }
  check("and a page waiting behind it", empty === "", empty || "six hotels");
}

// The door turns the key itself, in one press. Two presses to open a door is a
// mechanism, and this is meant to be a door.
{
  const { readFileSync } = await import("node:fs");
  const door = readFileSync("apps/web/components/environment/HingedDoor.tsx", "utf8");
  check("a door checks what it says it needs",
    /carrying\[spec\.needs\] === true/.test(door));
  check("and says so only when the player has it",
    /hasKey \? "Unlock" : "Locked"/.test(door));
  check("and a door once unlocked does not lock itself again",
    /unlockedDoors\[spec\.id\]/.test(door));
}

// The telephone. It rings from behind the one door on the floor that opens,
// which is what separates it from the knocking: that one cannot be answered.
{
  const { isCarried } = await import("../game/systems/anomaly");
  const { readFileSync } = await import("node:fs");

  check("a ringing telephone leaves the floor otherwise untouched",
    isCarried("telephone"), "or the floor would be wrong in two ways at once");

  // The fixture is there whether it rings or not. A telephone that only
  // existed on the floors it rang on could be found by looking, not listening.
  const phones = (floor: number, seed: string) => {
    const spec = generateFloor(floor, seed);
    const layout = buildFloor(spec);
    const room = spec.rooms.find((r) => r.keyed)!;
    const middle = roomCentre(room);
    return layout.props.filter((prop) =>
      prop.id === "telephone"
      && Math.hypot(prop.position[0] - middle[0], prop.position[2] - middle[2]) < 1.4).length;
  };

  let missing = "";
  let ringing = 0;
  for (const seed of SEEDS) {
    for (const floor of FLOORS) {
      // Unless the floor's fault is that the telephone is not there.
      const absent = generateFloor(floor, seed).anomaly?.kind === "phone-gone";
      if (phones(floor, seed) !== (absent ? 0 : 1)) missing += ` ${seed}/${floor};`;
      if (generateFloor(floor, seed).anomaly?.kind === "telephone") ringing += 1;
    }
  }
  check("there is a telephone in that room on every floor", missing === "",
    missing || `${SEEDS.length * FLOORS.length} floors`);
  check("ringing or not", ringing < SEEDS.length * FLOORS.length,
    `${ringing} of ${SEEDS.length * FLOORS.length} floors have it ringing`);

  const driver = readFileSync("apps/web/components/game/Audio.tsx", "utf8");
  check("it rings from the door of the room the key opens",
    /room\.keyed/.test(driver) && /keyed\.doorZ/.test(driver));
  check("and stops when that door is opened",
    /!useGameStore\.getState\(\)\.unlocked\[ringAt\.door\]/.test(driver),
    "opening it is the only way to answer");
}

// Two faults that live on the things the key is for. Both are simply an
// absence, which is the hardest kind to see and the fairest: the player has
// stood in that room before, on a floor with nothing wrong with it.
{
  const { ANOMALY_KINDS, isCarried } = await import("../game/systems/anomaly");

  check("both are kinds the game knows about",
    ANOMALY_KINDS.includes("key-gone") && ANOMALY_KINDS.includes("phone-gone"));
  check("and neither disturbs the plan",
    isCarried("key-gone") && isCarried("phone-gone"),
    "the floor is wrong in one way, not two");

  // Reachable. A kind that never comes up is a kind nobody will ever see.
  const seen = new Set<string>();
  for (let i = 0; i < 300; i += 1) {
    for (const floor of [4, 3, 2, 1, -1, -2, -3]) {
      const kind = generateFloor(floor, `sweep-${i}`).anomaly?.kind;
      if (kind) seen.add(kind);
    }
  }
  check("and both actually come up", seen.has("key-gone") && seen.has("phone-gone"),
    `${seen.size} kinds across 2100 floors`);

  // What each one removes, and only that.
  let wrong = "";
  for (let i = 0; i < 300 && wrong === ""; i += 1) {
    for (const floor of [4, 3, 2, 1, -1, -2, -3]) {
      const seed = `sweep-${i}`;
      const spec = generateFloor(floor, seed);
      const layout = buildFloor(spec);
      const key = layout.items.some((item) => item.id === GUEST_KEY);
      const book = layout.items.some((item) => item.id === "ledger");
      const phone = layout.props.some((prop) => prop.id === "telephone");

      if (spec.anomaly?.kind === "key-gone") {
        if (key) wrong += ` ${seed}/${floor}: the key is still there;`;
        // The notebook lies beside it, and is not what is missing.
        if (!book) wrong += ` ${seed}/${floor}: it took the notebook too;`;
        if (!phone) wrong += ` ${seed}/${floor}: it took the telephone too;`;
      } else if (spec.anomaly?.kind === "phone-gone") {
        if (phone) wrong += ` ${seed}/${floor}: the telephone is still there;`;
        if (!key) wrong += ` ${seed}/${floor}: it took the key too;`;
      } else {
        if (!key || !book || !phone) wrong += ` ${seed}/${floor}: something is missing anyway;`;
      }
    }
  }
  check("each takes one thing and leaves the rest", wrong === "", wrong || "2100 floors");
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
