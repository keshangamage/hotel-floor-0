import type { FloorLayout } from "@/game/types";

import { LightSwitch } from "./LightSwitch";

export function Switches({ layout }: { layout: FloorLayout }) {
  return (
    <>
      {layout.switches.map((spec) => (
        <LightSwitch key={spec.id} spec={spec} />
      ))}
    </>
  );
}
