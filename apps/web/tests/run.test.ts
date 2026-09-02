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
const reset = () => useGameStore.setState({ trapped: false, offered: null, floorNumber: 5 });

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
  for (const key of ["seed", "floorNumber", "trapped", "offered"]) {
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
  const { panelButtons } = await import("../game/data/panel");
  const { ELEVATOR_CONFIG } = await import("../game/systems/elevator");
  const numbered = panelButtons(ELEVATOR_CONFIG.servedFloors, false, null)
    .filter((row) => row.kind === "floor")
    .map((row) => row.floor);
  check("the panel offers the floors the hotel has",
    [5, 4, 3, 2, 1, 0].every((floor) => numbered.includes(floor)),
    "so pressing 0 is an accident among ordinary buttons");
  // The floors under the building are not on the panel to begin with.
  check("but not the ones beneath it", numbered.every((floor) => (floor ?? 0) >= 0),
    numbered.join(", "));
  check("a trapped lift refuses every one of them",
    /if \(trapped && floor !== offered\)/.test(lift));
  // Silence would read as the game missing the input rather than refusing it.
  check("but still answers the press with a sound",
    /floor !== offered\)[\s\S]{0,220}audio\.click/.test(lift));
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
  // The overlay used to be the pointer lock target itself, so every control on
  // it had to stop its own click from starting the game. Only one element is
  // the target now, which is a stronger version of the same rule: nothing else
  // on the menu can begin a run by being clicked.
  const overlay = read("components/ui/Overlay.tsx");
  const targets = overlay.split('id="pointer-lock-target"').length - 1;
  check("exactly one thing on the menu locks the pointer", targets === 1,
    `${targets} found`);
  check("and it is a button, not the whole screen",
    /<button\s+id="pointer-lock-target"/.test(overlay));
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

  // A flickering fixture is purely visual, behind an opaque overlay, and
  // costs the player nothing to leave running.
  check("a flickering lamp is left alone", !gated(read("lighting/CeilingLamp.tsx")),
    "purely visual, behind an opaque overlay");
  // The torch used to be in that list. It burns a cell now, so a paused game
  // that kept draining it would take something from a player who is not there.
  check("but the torch stops, because it is spending something",
    gated(read("player/Flashlight.tsx")));
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

// The way on. A dead lift takes one floor, and only after the player has found
// what is waiting at the end of floor zero.
{
  reset();
  store().setTrapped();
  check("a trapped lift takes nowhere at first", store().offered === null);

  store().offer(-1);
  check("something found makes it take one floor", store().offered === -1);

  // Never back up, and never two at once: the hotel chooses, always downward.
  store().offer(0);
  check("it will not be talked upward", store().offered === -1, "0 refused");
  store().offer(5);
  check("nor back to the player's own floor", store().offered === -1);
  store().offer(-2);
  check("but it will go further down", store().offered === -2);
}

// The panel is dead until a page opens something.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("the dead panel refuses everything but that floor",
    /if \(trapped && floor !== offered\)/.test(lift));
  // The layout is data now, so this asks the layout rather than the JSX.
  const { panelButtons } = await import("../game/data/panel");
  const { ELEVATOR_CONFIG } = await import("../game/systems/elevator");
  const before = panelButtons(ELEVATOR_CONFIG.servedFloors, true, null);
  const after = panelButtons(ELEVATOR_CONFIG.servedFloors, true, -1);
  check("and grows a button for it that was not there before",
    !before.some((row) => row.kind === "offered")
      && after.some((row) => row.kind === "offered" && row.floor === -1));
}

// A floor under the building carries the numbers of the player's own, which is
// worse than a number that makes no sense.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const below = generateFloor(-1);
  const own = generateFloor(5);
  check("floors below the ground repeat the fifth's numbers",
    JSON.stringify(below.rooms.map((r) => r.number)) === JSON.stringify(own.rooms.map((r) => r.number)),
    below.rooms.slice(0, 3).map((r) => r.number).join(", "));
  check("and none of them is a negative number",
    below.rooms.every((r) => r.number > 0));
  // It still has to be a floor a player can walk.
  check("it is still a working floor",
    below.rooms.length === 8 && below.corridorFrom < below.corridorTo);
}

// The descent below the hotel. Each floor holds one page, the page opens the
// next, and the last one opens nothing.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");

  // The page at the end of the corridor, not the notice on the room's desk.
  const page = (floor: number) =>
    buildFloor(generateFloor(floor)).notes.find((n) => n.id.startsWith("floor-"));

  // Walk it the way the player does: read what is here, press what it opens.
  const chain = [0];
  for (let step = 0; step < 12; step += 1) {
    const floor = chain[chain.length - 1] as number;
    const found = page(floor);
    // The end of the walk is a floor with nothing left to read on it.
    if (!found?.opens) break;
    check(`floor ${floor} opens the one below it`, found.opens === floor - 1,
      `opens ${found.opens}`);
    chain.push(found.opens);
  }
  check("the descent runs from the ground floor to the bottom", chain.length >= 5,
    `floors ${chain.join(", ")}`);
  check("and stops where there is nothing further to read",
    page(chain[chain.length - 1] as number)?.opens === undefined,
    `floor ${chain[chain.length - 1]} is the end`);

  // A page in the dark is a page that is not there. This floor has no doors
  // and no numbers, so the page is the only thing on it, and if it cannot be
  // seen the run stops on floor zero.
  let unlit = "";
  for (const floor of chain) {
    const spec = generateFloor(floor);
    const found = page(floor);
    if (!found) continue;
    const nearest = Math.min(...spec.lamps
      .filter((lamp) => lamp.lit)
      .map((lamp) => Math.abs(lamp.z - found.position[2])));
    if (nearest > 1.5) unlit += ` floor ${floor} is ${nearest.toFixed(1)}m from a light;`;
  }
  check("every page lies in a pool of light", unlit === "", unlit || "on all of them");

  // Every floor of it has to be reachable by the lift, or the chain stops
  // somewhere the player cannot follow.
  const { ELEVATOR_CONFIG, isServed } = await import("../game/systems/elevator");
  const unreachable = chain.filter((f) => !isServed(f, ELEVATOR_CONFIG));
  check("the lift can reach every floor the pages open", unreachable.length === 0,
    unreachable.join(", ") || `${chain.length} floors`);
  check("and no further than the last of them",
    !isServed(Math.min(...chain) - 1, ELEVATOR_CONFIG),
    "so the panel never advertises how deep this goes");
  // It has to end on G. Ending anywhere else leaves the player on a floor with
  // no page to read and no button to press.
  const { G_FLOOR } = await import("../game/systems/elevator");
  check("the descent ends at G", chain[chain.length - 1] === G_FLOOR,
    `ends on ${chain[chain.length - 1]}`);
  // G is the fifth floor: nine floors down, the doors open on the corridor the
  // player started in, with nothing wrong with it.
  const g = generateFloor(G_FLOOR);
  const home = generateFloor(5);
  check("and G is the floor the player started on",
    JSON.stringify(g.rooms) === JSON.stringify(home.rooms) && g.anomaly === null);

  // Reaching it with the doors open is what ends the run.
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("arriving at G ends the game",
    /state\.phase === "open" && state\.floor === G_FLOOR/.test(lift));
  check("and the ending is a phase, not a screen the player can pause out of",
    /phase === "playing" \|\| phase === "ending"/.test(
      readFileSync("apps/web/components/ui/Overlay.tsx", "utf8")));

  // A page opens a floor by saying so, not by its name.
  check("a page opens a floor by carrying it",
    /spec\.opens !== undefined\) offer\(spec\.opens\)/.test(
      readFileSync("apps/web/components/environment/Note.tsx", "utf8")));
}

// Beginning a different hotel. Until now the only way out of a run was to
// finish it, and nothing on the way in said the game had kept one at all.
{
  const before = store().seed;
  useGameStore.setState({
    floorNumber: -2,
    trapped: true,
    offered: -3,
    carrying: { "key-guest": true, ledger: true },
    unlocked: { "room-503": true },
    spent: { "cell-4": true },
    marked: { "3": true, "1": true },
    visited: { "5": true, "4": true, "3": true },
    lightsOff: { "room-505-bedside": true },
    torch: 0.1,
    reading: null,
  });

  store().restart();
  const after = store();

  check("a different hotel is a different hotel", after.seed !== before,
    `${before} -> ${after.seed}`);
  check("and starts at the top", after.floorNumber === 5 && after.phase === "menu");
  // Everything a run accumulates. A key or a mark carried across would be the
  // player finding a door already unlocked in a building they have not entered.
  const leftovers = ([
    ["carrying", after.carrying],
    ["unlocked", after.unlocked],
    ["spent", after.spent],
    ["marked", after.marked],
    ["visited", after.visited],
    ["lightsOff", after.lightsOff],
  ] as const).filter(([, held]) => Object.keys(held).length > 0).map(([name]) => name);
  check("and carries nothing over from the last one", leftovers.length === 0,
    leftovers.join(", ") || "six records cleared");
  check("the lift answers again", !after.trapped && after.offered === null);
  check("and the torch is full", after.torch === 1);
  check("and the scene is rebuilt rather than left standing", after.run > 0,
    "the player and the car hold position otherwise");

  reset();
}

// The way in has to offer it, and only when there is something to leave.
{
  const { readFileSync } = await import("node:fs");
  const menu = readFileSync("apps/web/components/ui/Overlay.tsx", "utf8");
  check("the menu offers a different hotel", /Begin a different hotel/.test(menu));
  check("only once a run is underway", /underway && \(/.test(menu));
  // The brief asks for these three by name.
  check("and has a way into settings and credits",
    /setPanel\("settings"\)/.test(menu) && /setPanel\("credits"\)/.test(menu));
  check("and says where the last one stopped", /You left off on floor/.test(menu),
    "or nothing ever tells the player the game saved it");
}

// Floor zero puts itself out behind the player.
//
// It is never judged, so nothing on it has to match anything, which is what
// makes this safe: on any other floor a lamp going out is an anomaly the
// player is meant to write down.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");
  const { readFileSync } = await import("node:fs");

  const ground = generateFloor(0);
  const layout = buildFloor(ground);
  const named = layout.lamps.filter((lamp) => lamp.id?.startsWith("ground-"));
  check("the corridor's lamps can be put out", named.length >= 3,
    `${named.length} of ${layout.lamps.length}`);

  // The one over the page is not among them. It is the only thing on the floor
  // to walk towards, and putting it out would leave nothing to find.
  const page = layout.notes.find((note) => note.id === "floor-0-notice")!;
  const overhead = layout.lamps
    .filter((lamp) => lamp.lit !== false)
    .sort((a, b) =>
      Math.abs(a.position[2] - page.position[2]) - Math.abs(b.position[2] - page.position[2]))[0]!;
  check("but the one over the page is not one of them", overhead.id === undefined,
    "or the walk ends in the dark with nothing in it");

  // And nowhere else. Only this floor has lamps that anything can reach.
  const elsewhere = [5, 4, 3, 2, 1, -1, -2, -3].filter((floor) =>
    buildFloor(generateFloor(floor)).lamps.some((lamp) => lamp.id?.startsWith("ground-")));
  check("and no other floor has any", elsewhere.length === 0,
    elsewhere.join(", ") || "eight floors");

  const driver = readFileSync("apps/web/components/horror/GoingOut.tsx", "utf8");
  check("it happens on floor zero and nowhere else",
    /spec\.floorNumber !== ENDING_FLOOR\) return/.test(driver));
  check("and only once the lamp is behind them",
    /camera\.position\.z > pool\.z - BEHIND\) continue/.test(driver),
    "a light snapping off in view is a switch thrown at the player");
}

// A door on floor zero, on the way back.
//
// The player has just walked the length of a corridor with no rooms off it. On
// the return there is a door in it, and the number on the door is their own.
// This is the only place the architecture is allowed to be impossible, because
// this floor is the only one nothing is compared against: on any other floor a
// door that was not there before is a fault the player is meant to write down.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");

  const before = buildFloor(generateFloor(0));
  const after = buildFloor(generateFloor(0), { returning: true });

  check("floor zero has no doors on the way in", before.doors.length === 0,
    `${before.doors.length} doors`);
  check("and one on the way back", after.doors.length === 1);

  const door = after.doors[0];
  check("numbered with the player's own room", door?.label === "507", door?.label);
  check("and locked", door?.locked === true);
  check("but it takes the key they are carrying", door?.needs !== undefined, door?.needs);

  // A room behind it, or the door is a picture of a door.
  check("there is a room behind it", after.boxes.length > before.boxes.length,
    `${before.boxes.length} boxes becomes ${after.boxes.length}`);

  // Nowhere else. Every other floor is being judged.
  const elsewhere = [5, 4, 3, 2, 1, -1, -2, -3].filter((floor) =>
    JSON.stringify(buildFloor(generateFloor(floor)))
      !== JSON.stringify(buildFloor(generateFloor(floor), { returning: true })));
  check("and no other floor grows one", elsewhere.length === 0,
    elsewhere.join(", ") || "eight floors unchanged");

  // Empty. Every other locked room holds a page, a telephone and a spare cell,
  // which are the reasons to open it. This one is the reason.
  check("and the room behind it is empty",
    !after.notes.some((n) => n.id === "kept-note")
      && !after.props.some((p) => p.id === "telephone")
      && !after.items.some((i) => i.id === "battery"),
    "the door is the point, not what is in it");

  // Reachable: it is halfway along, so it is passed on the way out as well as
  // on the way back, and the player cannot miss it by hugging one wall.
  const spec0 = generateFloor(0);
  const at = after.doors[0]!.hinge[2];
  const along = (at - spec0.corridorFrom) / (spec0.corridorTo - spec0.corridorFrom);
  check("and it is halfway along the corridor", along > 0.3 && along < 0.7,
    `${Math.round(along * 100)}% of the way back`);
}

// A page is held while the game is being played and at no other time.
//
// Escape is the browser leaving pointer lock rather than a key the game is
// told about, so pausing mid-page used to leave the page up: it is drawn over
// the pause menu, and the key that puts it down is only read while playing.
// The player could neither read the menu nor close the page, and the only way
// out was a reload.
{
  const { buildFloor } = await import("../game/data/floor");
  const { generateFloor } = await import("../game/generation/generateFloor");
  const page = buildFloor(generateFloor(4)).notes[0]!;

  useGameStore.setState({ phase: "playing", reading: page });
  store().setPhase("paused");
  check("pausing puts down whatever was being read", store().reading === null,
    "it covered the menu that was the only way back");

  useGameStore.setState({ phase: "playing", reading: page });
  store().finish();
  check("and so does the ending", store().reading === null,
    "the lift can arrive at G while the notebook is open");

  // The other way down, which is the one the note itself advertises.
  const { readFileSync } = await import("node:fs");
  const actions = readFileSync("apps/web/components/player/InputActions.tsx", "utf8");
  check("and E still puts it down without leaving the corridor",
    /if \(reading\) \{\s*\n\s*if \(input\.consumePress\("interact"\)\) readNote\(null\);/.test(actions));
  useGameStore.setState({ phase: "playing", reading: null });
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
