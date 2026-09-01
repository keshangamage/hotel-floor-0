// zustand turns persist off entirely when there is no localStorage, so the
// stub has to exist before the store module is evaluated.
const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
};

const { useGameStore } = await import("../store/useGameStore");

let fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`);
};

const store = () => useGameStore.getState();
const reset = () => useGameStore.setState({ trapped: false, floorNumber: 5 });

// The premise. The lift works like any hotel's until the player reaches floor
// zero, and never again afterwards.
{
  reset();
  check("the lift answers to begin with", store().trapped === false);
  store().setTrapped();
  check("reaching floor zero stops it", store().trapped === true);
  store().setTrapped();
  check("and it stays stopped", store().trapped === true, "never undone");
}

// The trap is the run. A player who reloads is still stuck.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("apps/web/store/useGameStore.ts", "utf8");
  const block = source.slice(source.indexOf("partialize:"));
  for (const key of ["seed", "floorNumber", "trapped"]) {
    check(`${key} survives a reload`, new RegExp(`${key}: state\\.${key}`).test(block));
  }
  // Restoring these would drop the player into a paused menu holding a note.
  const moment = ["phase", "reading", "interactPrompt"];
  const leaked = moment.filter((k) => new RegExp(`${k}: state\\.${k}`).test(block));
  check("nothing about the moment is saved", leaked.length === 0, leaked.join(", ") || "none");
  check("hydration is deferred to the client", /skipHydration:\s*true/.test(source));
  check("and something actually rehydrates",
    /persist\.rehydrate\(\)/.test(readFileSync("apps/web/components/game/GameShell.tsx", "utf8")));
}

// The lift itself: a normal panel that goes dead.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("the panel offers the floors the hotel has",
    /ELEVATOR_CONFIG\.servedFloors\.map/.test(lift),
    "so pressing 0 is an accident among ordinary buttons");
  check("a trapped lift refuses every one of them", /if \(trapped\)/.test(lift));
  // Silence would read as the game missing the input rather than refusing it.
  check("but still answers the press with a sound",
    /if \(trapped\)[\s\S]{0,220}audio\.click/.test(lift));
  // Sprung on arrival, so the doors open before the player learns they cannot
  // leave.
  check("the trap springs when the doors open, not when the button is pressed",
    /state\.floor === ENDING_FLOOR\) useGameStore\.getState\(\)\.setTrapped/.test(lift));
}

// Settings outlive everything, since resetting someone's volume is its own
// small insult.
{
  reset();
  store().setVolume(0.25);
  store().setSensitivity(1.8);
  store().setTrapped();
  check("settings survive being trapped",
    store().volume === 0.25 && store().sensitivity === 1.8);

  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/${f}`, "utf8");
  check("volume reaches the mixer", /audio\.setVolume\(volume\)/.test(read("components/game/Audio.tsx")));
  check("the mixer ramps rather than jumps", /setTargetAtTime/.test(read("game/systems/audio.ts")),
    "a gain that jumps clicks on every pixel of a drag");
  check("sensitivity reaches the look controls",
    /pointerSpeed=\{POINTER_SPEED \* sensitivity\}/.test(read("components/player/LookControls.tsx")));
  check("a click on a slider does not lock the pointer",
    /stopPropagation/.test(read("components/ui/Overlay.tsx")));
}

// Pausing has to freeze the world, not half of it.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/components/${f}`, "utf8");
  const gated = (src: string) => /phase !== "playing"\) return|phase === "playing"/.test(src);

  for (const [what, file] of [
    ["the lift", "environment/Elevator.tsx"],
    ["the hotel's sound", "game/Audio.tsx"],
    ["a swinging door", "environment/HingedDoor.tsx"],
    ["the player", "player/Player.tsx"],
    ["interaction", "game/Interactions.tsx"],
    ["things that move unwatched", "horror/LookAway.tsx"],
  ] as const) {
    check(`${what} stops when the game is paused`, gated(read(file)));
  }

  check("the torch and the flicker are left alone",
    !gated(read("lighting/CeilingLamp.tsx")) && !gated(read("player/Flashlight.tsx")),
    "purely visual, behind an opaque overlay");
}

// A device that cannot play must be told so, not left looking at a black
// screen having downloaded ten megabytes of hotel for nothing.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const gate = readFileSync("apps/web/components/game/Unsupported.tsx", "utf8");
  const shell = readFileSync("apps/web/components/game/GameShell.tsx", "utf8");

  check("touch devices are detected", /pointer: coarse/.test(gate));
  check("and so is a browser without pointer lock", /requestPointerLock" in document/.test(gate));
  check("read without an effect", /useSyncExternalStore/.test(gate));
  check("and assumed playable on the server", /\(\) => true/.test(gate));
  check("the game does not mount on an unplayable device",
    /if \(!playable\)/.test(shell) && shell.indexOf("if (!playable)") < shell.indexOf("<GameCanvas"),
    "returns before the canvas");

  const layout = readFileSync("apps/web/app/layout.tsx", "utf8");
  check("a shared link carries a title and description",
    /openGraph:/.test(layout) && /twitter:/.test(layout));
  check("and an image to unfurl", existsSync("apps/web/app/opengraph-image.tsx"));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
