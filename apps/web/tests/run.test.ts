// zustand turns persist off entirely when there is no localStorage, so the
// stub has to exist before the store module is evaluated.
const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
};

const { useGameStore } = await import("../store/useGameStore");

import { DEPTH_TO_WIN, floorAtDepth, judge } from "../game/systems/descent";
import { generateFloor } from "../game/generation/generateFloor";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`);
};

const store = () => useGameStore.getState();
const reset = () => useGameStore.setState({ depth: 0, best: 0, finished: 0, pendingSeed: null, lastCall: null, floorNumber: 5 });

// A right call keeps the hotel: the player is meant to carry what they learned
// on the last floor down to the next one.
{
  reset();
  const before = store().seed;
  store().recordCall(judge(0, false, "unchanged"), null);
  check("a right call queues no new hotel", store().pendingSeed === null);
  store().setFloorNumber(4);
  check("and leaves the seed alone", store().seed === before, store().seed);
  check("depth advances", store().depth === 1, `${store().depth}`);
}

// A wrong call has to hand out a different hotel, or the player remembers
// which floors they already cleared and walks straight back down.
{
  reset();
  const before = store().seed;
  store().recordCall(judge(3, false, "changed"), null);
  check("a wrong call queues a new hotel", store().pendingSeed !== null);
  check("but has not swapped it yet", store().seed === before,
    "the doors are still open at this point");
  check("the run is lost", store().depth === 0, `depth ${store().depth}`);

  store().setFloorNumber(5);
  check("arriving swaps the hotel", store().seed !== before, `${before} -> ${store().seed}`);
  check("and clears the queue", store().pendingSeed === null);
}

// Two failures must not give the same hotel twice.
{
  const seeds = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    reset();
    store().recordCall(judge(2, false, "changed"), null);
    store().setFloorNumber(5);
    seeds.add(store().seed);
  }
  check("every attempt is a different hotel", seeds.size === 40, `${seeds.size}/40 unique`);
}

// A new hotel still has to be a playable one.
{
  const bad: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    reset();
    store().recordCall(judge(2, false, "changed"), null);
    store().setFloorNumber(5);
    const seed = store().seed;
    for (const floor of [5, 4, 3, 2, 1]) {
      const spec = generateFloor(floor, seed);
      if (spec.rooms.length !== 8 || spec.corridorFrom >= spec.corridorTo) bad.push(`${seed}@${floor}`);
    }
  }
  check("a fresh hotel is still a working one", bad.length === 0, bad.slice(0, 2).join(", ") || "40 hotels");
}

// The reference floor is the reference in every hotel, not just the first.
{
  const wrong: string[] = [];
  for (let i = 0; i < 60; i += 1) {
    reset();
    store().recordCall(judge(1, false, "changed"), null);
    store().setFloorNumber(5);
    if (generateFloor(5, store().seed).anomaly !== null) wrong.push(store().seed);
  }
  check("floor 5 is never anomalous in a fresh hotel", wrong.length === 0, `${wrong.length}`);
}

// Finishing must not be a dead end. Before this the car refused every call at
// floor zero, so the only way to play again was to reload the page.
{
  reset();
  useGameStore.setState({ depth: 5, floorNumber: 0, lastCall: { correct: true, won: true, was: null } });
  const before = store().seed;
  store().beginAgain();
  check("starting again queues a different hotel", store().pendingSeed !== null);
  check("the run is back to the top", store().depth === 0);
  // A failed call announces itself; choosing to start again should not.
  check("and says nothing on arrival", store().lastCall === null);
  store().setFloorNumber(5);
  check("the new hotel takes effect", store().seed !== before, `${before} -> ${store().seed}`);
}

// A run survives a refresh, and the tally survives everything.
{
  reset();
  // Deepest reached must not fall back when a run is lost.
  store().recordCall(judge(0, false, "unchanged"), null);
  store().recordCall(judge(1, false, "unchanged"), null);
  check("deepest tracks the run", store().best === 2, `${store().best}`);
  store().recordCall(judge(2, false, "changed"), null);
  check("losing the run does not lose the record",
    store().depth === 0 && store().best === 2, `depth ${store().depth}, best ${store().best}`);

  store().recordCall(judge(4, false, "unchanged"), null);
  check("finishing is counted", store().finished === 1, `${store().finished}`);
  store().recordCall(judge(4, false, "unchanged"), null);
  check("and counted again on a second run", store().finished === 2, `${store().finished}`);
}

// What is written down has to be the run, not the moment. Checked from the
// source: zustand drops persist entirely outside a browser, so there is no
// runtime API to ask here.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    "apps/web/store/useGameStore.ts", "utf8");
  const block = source.slice(source.indexOf("partialize:"));
  const listed = ["seed", "depth", "floorNumber", "best", "finished"]
    .filter((k) => new RegExp(`${k}: state\\.${k}`).test(block));
  check("the run and the tally are saved", listed.length === 5, listed.join(", "));
  check("and the hotel queued by a lost run", /pendingSeed: state\.pendingSeed/.test(block));

  // Restoring these would drop the player into a paused menu holding a note.
  // pendingSeed is deliberately not among them: it describes the outcome of
  // the run rather than the moment, and dropping it let a reload during the
  // ride back restart the hotel the player had just learned.
  const transient = ["phase", "reading", "interactPrompt", "lastCall"];
  const leaked = transient.filter((k) => new RegExp(`${k}: state\\.${k}`).test(block));
  check("nothing about the moment is", leaked.length === 0, leaked.join(", ") || "none");

  // Hydrating during store creation is what breaks a server rendered page.
  check("hydration is deferred to the client", /skipHydration:\s*true/.test(source));
  check("and something actually rehydrates",
    /persist\.rehydrate\(\)/.test(readFileSync(
      "apps/web/components/game/GameShell.tsx", "utf8")));
}

// Settings outlive a run, so they belong with the tally rather than the moment.
{
  reset();
  store().setVolume(0.25);
  store().setSensitivity(1.8);
  check("volume is settable", store().volume === 0.25, `${store().volume}`);
  check("sensitivity is settable", store().sensitivity === 1.8, `${store().sensitivity}`);

  // Losing a run must not reset how loud the game is.
  store().recordCall(judge(2, false, "changed"), null);
  store().setFloorNumber(5);
  check("a lost run keeps the settings",
    store().volume === 0.25 && store().sensitivity === 1.8,
    `${store().volume}, ${store().sensitivity}`);
  store().beginAgain();
  check("and so does starting again",
    store().volume === 0.25 && store().sensitivity === 1.8);
}

// Every link from the slider to the thing it moves.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/${f}`, "utf8");

  const saved = read("store/useGameStore.ts");
  const block = saved.slice(saved.indexOf("partialize:"));
  check("settings are saved",
    /volume: state\.volume/.test(block) && /sensitivity: state\.sensitivity/.test(block));

  check("volume reaches the mixer", /audio\.setVolume\(volume\)/.test(read("components/game/Audio.tsx")));
  check("the mixer ramps rather than jumps",
    /setTargetAtTime/.test(read("game/systems/audio.ts")),
    "a gain that jumps clicks on every pixel of a drag");
  check("sensitivity reaches the look controls",
    /pointerSpeed=\{POINTER_SPEED \* sensitivity\}/.test(read("components/player/LookControls.tsx")));
  // The overlay is the pointer lock target: a click on a slider would
  // otherwise lock the pointer and shut the menu the player is using.
  check("a click on a slider does not lock the pointer",
    /stopPropagation/.test(read("components/ui/Overlay.tsx")));
}

// A wrong call used to say only that the player was back on five, which taught
// them nothing: they could not tell a missed anomaly from one they imagined.
{
  reset();
  store().recordCall(judge(2, true, "unchanged"), "a picture has come off the corridor wall");
  check("a missed anomaly is remembered",
    store().lastCall?.was === "a picture has come off the corridor wall",
    store().lastCall?.was ?? "nothing");
  check("and the call is marked wrong", store().lastCall?.correct === false);

  reset();
  store().recordCall(judge(2, false, "changed"), null);
  check("a floor with nothing wrong records nothing", store().lastCall?.was === null);
  check("and that call is wrong too", store().lastCall?.correct === false);

  reset();
  store().recordCall(judge(2, true, "changed"), "a fixture will not hold steady");
  check("a right call is still right when something was wrong",
    store().lastCall?.correct === true && store().depth === 3);
}

// Pausing has to freeze the world, not half of it. The room tone stopped on
// pause while the knocking carried on and the lift travelled through it,
// arriving on a different floor with the player still in the menu.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/components/${f}`, "utf8");
  const gated = (src: string) => /phase !== "playing"\) return|phase === "playing"/.test(src);

  // Anything that changes state or makes a sound.
  for (const [what, file] of [
    ["the lift", "environment/Elevator.tsx"],
    ["the hotel's sound", "game/Audio.tsx"],
    ["a swinging door", "environment/HingedDoor.tsx"],
    ["the player", "player/Player.tsx"],
    ["interaction", "game/Interactions.tsx"],
  ] as const) {
    check(`${what} stops when the game is paused`, gated(read(file)));
  }

  // And what is deliberately left running: nothing here changes state, and
  // the pause overlay covers the screen anyway.
  check("the torch and the flicker are left alone",
    !gated(read("lighting/CeilingLamp.tsx")) && !gated(read("player/Flashlight.tsx")),
    "purely visual, behind an opaque overlay");
}

// The reference floor is what every other floor is judged against, so asking
// for a verdict on it is a question with one answer. A player could still get
// it wrong and lose the run before the game had begun.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("the lift knows when it is on the reference floor",
    /floorNumber === REFERENCE_FLOOR/.test(lift));
  check("and offers the ride rather than a verdict there",
    /reference && !finished \? \(/.test(lift) && /prompt="Go down"/.test(lift));

  // Riding down from it must still count as progress.
  reset();
  const verdict = judge(0, false, "unchanged");
  check("the free ride still goes a floor deeper", verdict.depth === 1 && verdict.correct);
}

// Depth and the floor move at different moments: depth when the player
// presses, the floor when the car arrives. A save taken between the two had
// them out of step, and restoring both verbatim put the player on one floor
// with the progress of another, skipping a floor on their next right answer.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("apps/web/store/useGameStore.ts", "utf8");
  check("a restored save derives the floor from depth",
    /merge:/.test(source) && /floorNumber: floorAtDepth\(depth\)/.test(source));

  // And the two agree once a journey has finished, which is the state a save
  // is normally taken in.
  const drift: string[] = [];
  for (let depth = 0; depth < DEPTH_TO_WIN; depth += 1) {
    reset();
    useGameStore.setState({ depth, floorNumber: floorAtDepth(depth) });
    const verdict = judge(depth, false, "unchanged");
    store().recordCall(verdict, null);
    // The car arrives.
    store().setFloorNumber(verdict.floor);
    if (store().floorNumber !== floorAtDepth(store().depth)) {
      drift.push(`depth ${store().depth} on floor ${store().floorNumber}`);
    }
  }
  check("floor and depth agree once the car has arrived", drift.length === 0,
    drift.join(", ") || `${DEPTH_TO_WIN} journeys`);

  // Mid journey they deliberately disagree, which is why the restore exists.
  reset();
  useGameStore.setState({ depth: 2, floorNumber: 3 });
  store().recordCall(judge(2, false, "unchanged"), null);
  check("and disagree in flight, which is the case that needed handling",
    store().floorNumber !== floorAtDepth(store().depth),
    `depth ${store().depth} says floor ${floorAtDepth(store().depth)}, still on ${store().floorNumber}`);
}

// A wrong call queues a fresh hotel and the car takes a couple of seconds to
// carry the player back. Reloading inside that window used to drop the queue,
// restarting the very building they had just learned three floors of.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("apps/web/store/useGameStore.ts", "utf8");
  check("a queued hotel is taken up on restore",
    /seed: saved\.pendingSeed \?\? saved\.seed/.test(source),
    "rather than waiting for an arrival that will never come");
  check("and the queue is cleared with it", /pendingSeed: null,/.test(source));

  // The queue is only set by losing, so restoring must not disturb a run in
  // progress.
  reset();
  const before = store().seed;
  store().recordCall(judge(1, false, "unchanged"), null);
  check("a right call queues nothing to restore", store().pendingSeed === null);
  store().setFloorNumber(3);
  check("and leaves the hotel alone", store().seed === before);
}

// A device that cannot play must be told so, not left looking at a black
// screen having downloaded ten megabytes of hotel for nothing.
{
  const { readFileSync } = await import("node:fs");
  const gate = readFileSync("apps/web/components/game/Unsupported.tsx", "utf8");
  const shell = readFileSync("apps/web/components/game/GameShell.tsx", "utf8");

  check("touch devices are detected", /pointer: coarse/.test(gate));
  check("and so is a browser without pointer lock",
    /requestPointerLock" in document/.test(gate));

  // Read during render through the external store hook. An effect would set
  // state on mount, which this codebase's compiler rules refuse, and assuming
  // the worst on the server would flash the notice at every desktop visitor.
  check("read without an effect", /useSyncExternalStore/.test(gate));
  check("and assumed playable on the server", /\(\) => true/.test(gate));

  // The canvas must not mount at all: hiding it with CSS still fetches it.
  check("the game does not mount on an unplayable device",
    /if \(!playable\)/.test(shell) && shell.indexOf("if (!playable)") < shell.indexOf("<GameCanvas"),
    "returns before the canvas");
}

// A shared link is most of how a game like this travels.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const layout = readFileSync("apps/web/app/layout.tsx", "utf8");
  check("a shared link carries a title and description",
    /openGraph:/.test(layout) && /twitter:/.test(layout));
  check("and an image to unfurl", existsSync("apps/web/app/opengraph-image.tsx"));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
