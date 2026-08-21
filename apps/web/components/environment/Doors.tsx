import type { FloorLayout } from "@/game/types";

import { HingedDoor } from "./HingedDoor";

export function Doors({ layout }: { layout: FloorLayout }) {
  return (
    <>
      {layout.doors.map((spec) => (
        <HingedDoor key={spec.id} spec={spec} />
      ))}
    </>
  );
}
