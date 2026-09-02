import { InputManager } from "../game/systems/input";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const target = new EventTarget();
const input = new InputManager();
const detach = input.attach(target);

const key = (type: "keydown" | "keyup", code: string, repeat = false) =>
  target.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
const blur = () => target.dispatchEvent(new Event("blur"));

// Mapping
key("keydown", "KeyW");
check("KeyW maps to forward", input.isDown("forward"));
key("keyup", "KeyW");
check("keyup releases", !input.isDown("forward"));

key("keydown", "ArrowLeft");
check("arrow keys are bound too", input.isDown("left"));
key("keyup", "ArrowLeft");

key("keydown", "KeyQ");
check("unbound keys are ignored", !input.isDown("forward") && !input.isDown("interact"));

// Signed axis
key("keydown", "KeyD");
check("axis is +1 for right", input.axis("left", "right") === 1);
key("keydown", "KeyA");
check("opposing keys cancel to 0", input.axis("left", "right") === 0);
key("keyup", "KeyD");
check("axis is -1 for left alone", input.axis("left", "right") === -1);
key("keyup", "KeyA");

// One-shot presses
key("keydown", "KeyF");
check("first consumePress is true", input.consumePress("flashlight"));
check("second consumePress is false", !input.consumePress("flashlight"));

// Auto-repeat must not re-arm the one-shot while the key is still held.
key("keydown", "KeyF", true);
key("keydown", "KeyF", true);
check("auto-repeat does not re-arm a press", !input.consumePress("flashlight"));
check("but the key still reads as held", input.isDown("flashlight"));
key("keyup", "KeyF");
key("keydown", "KeyF");
check("a real re-press re-arms", input.consumePress("flashlight"));
key("keyup", "KeyF");

// Blur: the alt-tab-mid-stride bug.
key("keydown", "KeyW");
key("keydown", "ShiftLeft");
check("sprinting before blur", input.isDown("forward") && input.isDown("sprint"));
blur();
check("blur clears every held key", !input.isDown("forward") && !input.isDown("sprint"));

// Both Shift and Ctrl sides bind.
key("keydown", "ShiftRight");
check("ShiftRight also sprints", input.isDown("sprint"));
key("keyup", "ShiftRight");
key("keydown", "ControlLeft");
check("ControlLeft crouches", input.isDown("crouch"));
key("keyup", "ControlLeft");
key("keydown", "KeyC");
check("KeyC also crouches", input.isDown("crouch"));
key("keyup", "KeyC");

// Detach
key("keydown", "KeyW");
detach();
check("detach clears held state", !input.isDown("forward"));
key("keydown", "KeyW");
check("detach removes listeners", !input.isDown("forward"));

// StrictMode double-mount: attach twice, detach twice, nothing left behind.
const a = input.attach(target);
const b = input.attach(target);
a();
b();
key("keydown", "KeyW");
check("double attach then double detach leaves no listener", !input.isDown("forward"));

// The flashlight was a dead keybind for a while: the key toggled a store flag
// that no component ever read, so pressing it did nothing at all. Walk the
// whole chain rather than any one link.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) =>
    readFileSync(`apps/web/${f}`, "utf8");

  check("a key is bound to the flashlight",
    /KeyF:\s*"flashlight"/.test(read("game/systems/input.ts")));
  check("the key toggles the store",
    /consumePress\("flashlight"\)/.test(read("components/player/InputActions.tsx")));

  const flashlight = read("components/player/Flashlight.tsx");
  check("a component reads the flag", /flashlightOn/.test(flashlight));
  check("and turns it into an actual light", /<spotLight/.test(flashlight));
  check("the light is mounted in the scene",
    /<Flashlight\s*\/>/.test(read("components/game/GameCanvas.tsx")));
  // Mounted after the player, or it lags a frame behind the camera it follows.
  const canvas = read("components/game/GameCanvas.tsx");
  check("it follows the player rather than leading it",
    canvas.indexOf("<Flashlight") > canvas.indexOf("<Player"));
}

// Every key the game listens for has to be on the screen that lists them.
// Q was bound to writing a floor down and never added to that list, which made
// the notebook a thing the player could carry and not use.
{
  const { readFileSync } = await import("node:fs");
  const bindings = readFileSync("apps/web/game/systems/input.ts", "utf8");
  const overlay = readFileSync("apps/web/components/ui/Overlay.tsx", "utf8");

  const listed = [...overlay.matchAll(/\["([^"]+)",\s*"[^"]+"\]/g)].map((m) => m[1]!);
  check("the pause screen lists some controls", listed.length >= 5, listed.join(" "));

  // Letter keys, minus the ones a group entry already covers.
  const COVERED = new Map([["W", "WASD"], ["A", "WASD"], ["S", "WASD"], ["D", "WASD"], ["C", "Ctrl"]]);
  const bound = [...bindings.matchAll(/\bKey([A-Z]):/g)].map((m) => m[1]!);
  const undocumented = [...new Set(bound)].filter((letter) => {
    const under = COVERED.get(letter) ?? letter;
    return !listed.includes(under);
  });
  check("and every key that is bound is one of them", undocumented.length === 0,
    undocumented.join(", ") || `${new Set(bound).size} keys`);

  // The README lists them too, and went stale: it was missing three keys and
  // still said the flashlight had no light attached to it. It writes the
  // movement keys as `W A S D` where the overlay says WASD, so compare on the
  // backticked spans with their spaces taken out rather than on the raw text.
  const readme = readFileSync("README.md", "utf8");
  // Fenced blocks first, or a single backtick pattern swallows whole sections
  // of shell commands between them.
  const prose = readme.replace(/```[\s\S]*?```/g, "");
  const spans = [...prose.matchAll(/`{1,2}([^`\n]+)`{1,2}/g)]
    .map((m) => m[1]!.replace(/\s+/g, ""));
  const undocumentedThere = [...new Set(bound)].filter((letter) => {
    const under = COVERED.get(letter) ?? letter;
    return !spans.some((span) => span === under || span === letter);
  });
  check("and the README lists them as well", undocumentedThere.length === 0,
    undocumentedThere.join(", ") || "two places, one set of keys");
}

// The rule is written down exactly once, in the guest's hand, and the notebook
// hands it over the moment it is picked up.
{
  const { readFileSync } = await import("node:fs");
  const { FIRST_PAGE } = await import("../game/data/floor");
  const words = FIRST_PAGE.lines.join(" ");

  check("the notebook explains what the floors are",
    /same floor/i.test(words), FIRST_PAGE.title);
  check("and which key writes one down", /\bQ\b/.test(words));
  check("and it opens itself when picked up",
    /spec\.id === LEDGER\) read\(FIRST_PAGE\)/.test(
      readFileSync("apps/web/components/environment/Item.tsx", "utf8")),
    "a rule nobody reads is a rule nobody has");
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
