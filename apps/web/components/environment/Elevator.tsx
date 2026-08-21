import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef, useState } from "react";

import {
  CAR_CENTRE,
  DISPLAY_POSITION,
  DOOR_Z,
  ELEVATOR,
  PANEL_POSITION,
  PANEL_WIDTH,
} from "@/game/data/elevator";
import {
  ELEVATOR_CONFIG,
  callElevator,
  closeDoors,
  createElevator,
  displayFloor,
  isServed,
  requestFloor,
  stepElevator,
} from "@/game/systems/elevator";
import { useGameStore } from "@/store/useGameStore";

import { PanelButton } from "./PanelButton";
import { LAMP_PANEL_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";
import { SevenSegment } from "./SevenSegment";
import { SlidingDoor } from "./SlidingDoor";

/** Colder than the corridor tungsten, so the car reads as a different space. */
const CAR_LIGHT_COLOR = "#cfe0ff";
const PANEL_SIZE: [number, number, number] = [PANEL_WIDTH, ELEVATOR.doorHeight, ELEVATOR.doorThickness];

/** Top to bottom, as a hotel panel reads. */
const FLOOR_BUTTONS = [5, 4, 3, 2, 1];

export function Elevator() {
  const camera = useThree((state) => state.camera);
  const setFloorNumber = useGameStore((state) => state.setFloorNumber);
  const elevator = useRef(createElevator(5));
  const [readout, setReadout] = useState(5);

  useFrame((_, delta) => {
    const state = elevator.current;
    stepElevator(state, Math.min(delta, 0.05), ELEVATOR_CONFIG);

    const shown = displayFloor(state);
    if (shown !== readout) {
      setReadout(shown);
      setFloorNumber(shown);
    }
  });

  const doorProgress = useCallback(() => elevator.current.doors, []);
  const call = useCallback(() => callElevator(elevator.current, ELEVATOR_CONFIG), []);

  const press = useCallback((floor: number) => {
    requestFloor(elevator.current, floor, ELEVATOR_CONFIG);
  }, []);

  // Reaching the panel means standing in the car, so the player is looking at it.
  const inCar = camera.position.z > ELEVATOR.frontZ;

  return (
    <group>
      <SlidingDoor
        closedAt={[-PANEL_WIDTH / 2, ELEVATOR.doorHeight / 2, DOOR_Z]}
        size={PANEL_SIZE}
        stroke={-PANEL_WIDTH}
        progress={doorProgress}
      />
      <SlidingDoor
        closedAt={[PANEL_WIDTH / 2, ELEVATOR.doorHeight / 2, DOOR_Z]}
        size={PANEL_SIZE}
        stroke={PANEL_WIDTH}
        progress={doorProgress}
      />

      <SevenSegment value={String(readout)} position={DISPLAY_POSITION} />

      {/* Call plate in the lobby, beside the doors. */}
      <group position={[0.78, 1.15, ELEVATOR.frontZ - 0.03]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.metal} scale={[0.11, 0.16, 0.015]} />
        <PanelButton position={[0, 0, -0.014]} prompt="Call elevator" onPress={call} />
      </group>

      {/* Interior panel. */}
      <group position={PANEL_POSITION} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.metal} scale={[0.17, 0.56, 0.02]} />
        {FLOOR_BUTTONS.map((floor, index) => {
          const served = isServed(floor, ELEVATOR_CONFIG);
          return (
            <PanelButton
              key={floor}
              position={[0, 0.2 - index * 0.075, 0.014]}
              prompt={served ? `Floor ${floor}` : "Out of service"}
              onPress={() => press(floor)}
              lit={served && readout === floor}
              active={served}
            />
          );
        })}
        <PanelButton
          position={[0, -0.21, 0.014]}
          prompt="Close doors"
          onPress={() => closeDoors(elevator.current)}
          color="#8fb0ff"
        />
      </group>

      {/* Car ceiling light. */}
      <group position={[CAR_CENTRE[0], ELEVATOR.carHeight, CAR_CENTRE[2]]}>
        <mesh geometry={UNIT_BOX} material={LAMP_PANEL_MATERIAL} position={[0, -0.03, 0]} scale={[0.7, 0.02, 0.5]} />
        <pointLight
          color={CAR_LIGHT_COLOR}
          intensity={inCar ? 5 : 3.5}
          distance={5}
          decay={2}
          position={[0, -0.12, 0]}
        />
      </group>
    </group>
  );
}
