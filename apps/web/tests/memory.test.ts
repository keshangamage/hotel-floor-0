import { buildFloor } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const props = (floor: number, remembering: boolean) =>
  buildFloor(generateFloor(floor), { remembering }).props;
const ids = (floor: number, remembering: boolean) =>
  props(floor, remembering).map((p) => p.id).sort();

// Nothing changes until the last page has been read. Until then this floor is
// still being judged, and a room that rearranged itself under the player would
// be a difference they can see and cannot write down.
{
  for (const floor of [5, 4, 3, 2, 1, -1, -2, -3]) {
    const before = JSON.stringify(buildFloor(generateFloor(floor)));
    const same = JSON.stringify(buildFloor(generateFloor(floor), { remembering: false }));
    check(`floor ${floor} is unchanged while it is still being judged`, before === same);
  }
}

// And then the room is a child's bedroom behind the same door.
{
  const hotel = ids(-3, false);
  const remembered = ids(-3, true);
  check("the room is furnished differently", JSON.stringify(hotel) !== JSON.stringify(remembered),
    remembered.join(", "));

  // Half the furniture is gone: a nine year old has no writing desk.
  check("the desk and the wardrobe are gone",
    !remembered.includes("desk") && !remembered.includes("wardrobe"),
    hotel.filter((id) => !remembered.includes(id)).join(", ") || "nothing removed");
  check("but there is still a bed to sleep in", remembered.includes("bed"));

  const bedOf = (r: boolean) => props(-3, r).find((p) => p.id === "bed")!;
  check("and it is a child's bed", (bedOf(true).scale ?? 1) < (bedOf(false).scale ?? 1) * 0.8,
    `${bedOf(true).scale} against ${bedOf(false).scale ?? 1}`);

  // The chair is out on the floor facing the door, not tucked under anything.
  const chair = props(-3, true).find((p) => p.id === "chair")!;
  const tucked = props(-3, false).find((p) => p.id === "chair")!;
  check("and the chair was left out", Math.abs(chair.yaw - tucked.yaw) > 1,
    "turned to face the door rather than a desk");
}

// The notice on the desk is not a notice any more.
{
  const notice = (r: boolean) => buildFloor(generateFloor(-3), { remembering: r })
    .notes.find((n) => /^room-\d+-notice$/.test(n.id))!;
  const hotel = notice(false);
  const child = notice(true);

  check("the hotel's notice is gone", hotel.title !== child.title,
    `${hotel.title} -> ${child.title}`);
  check("and what is there was written by a child",
    child.lines.join(" ").includes("THIS IS MY ROOM"));
  check("with an adult underneath it",
    child.lines.join(" ").includes("only here for the week"),
    "the line the pages under the hotel have been building to");
}

// It hangs off the page that opens G, and nothing else.
{
  const { readFileSync } = await import("node:fs");
  const scene = readFileSync("apps/web/components/game/GameCanvas.tsx", "utf8");
  check("it is the last page that brings it on",
    /const remembering = offered === G_FLOOR/.test(scene));
  check("and the floor is rebuilt when it does",
    /buildFloor\(spec, \{ remembering, returning \}\)/.test(scene)
      && /\[spec, remembering, returning\]/.test(scene));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
