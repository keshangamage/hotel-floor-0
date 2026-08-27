// zustand turns persist off entirely when there is no localStorage, so the
// stub has to exist before the store module is evaluated.
const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
};

const { useGameStore } = await import("../store/useGameStore");

import { judge } from "../game/systems/descent";
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
  store().recordCall(judge(0, false, "down"), null);
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
  store().recordCall(judge(3, false, "up"), null);
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
    store().recordCall(judge(2, false, "up"), null);
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
    store().recordCall(judge(2, false, "up"), null);
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
    store().recordCall(judge(1, false, "up"), null);
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
  store().recordCall(judge(0, false, "down"), null);
  store().recordCall(judge(1, false, "down"), null);
  check("deepest tracks the run", store().best === 2, `${store().best}`);
  store().recordCall(judge(2, false, "up"), null);
  check("losing the run does not lose the record",
    store().depth === 0 && store().best === 2, `depth ${store().depth}, best ${store().best}`);

  store().recordCall(judge(4, false, "down"), null);
  check("finishing is counted", store().finished === 1, `${store().finished}`);
  store().recordCall(judge(4, false, "down"), null);
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

  // Restoring these would drop the player into a paused menu holding a note.
  const transient = ["phase", "reading", "pendingSeed", "interactPrompt", "lastCall"];
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
  store().recordCall(judge(2, false, "up"), null);
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
  store().recordCall(judge(2, true, "down"), "a picture has come off the corridor wall");
  check("a missed anomaly is remembered",
    store().lastCall?.was === "a picture has come off the corridor wall",
    store().lastCall?.was ?? "nothing");
  check("and the call is marked wrong", store().lastCall?.correct === false);

  reset();
  store().recordCall(judge(2, false, "up"), null);
  check("a floor with nothing wrong records nothing", store().lastCall?.was === null);
  check("and that call is wrong too", store().lastCall?.correct === false);

  reset();
  store().recordCall(judge(2, true, "up"), "a fixture will not hold steady");
  check("a right call is still right when something was wrong",
    store().lastCall?.correct === true && store().depth === 3);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
