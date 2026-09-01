import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";

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
  type ElevatorPhase,
  callElevator,
  closeDoors,
  createElevator,
  displayFloor,
  requestFloor,
  stepElevator,
} from "@/game/systems/elevator";
import { audio } from "@/game/systems/audio";
import { ENDING_FLOOR, type Anomaly } from "@/game/systems/anomaly";
import { useGameStore } from "@/store/useGameStore";

import { PanelButton } from "./PanelButton";
import { LAMP_PANEL_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";
import { SevenSegment } from "./SevenSegment";
import { SlidingDoor } from "./SlidingDoor";

/** Colder than the corridor tungsten, so the car reads as a different space. */
const CAR_LIGHT_COLOR = "#cfe0ff";
/** Doors and bell are heard from the corridor, so they come from the doorway. */
const SOUND_AT: readonly [number, number, number] = [0, 1.2, ELEVATOR.frontZ];
const PANEL_SIZE: [number, number, number] = [PANEL_WIDTH, ELEVATOR.doorHeight, ELEVATOR.doorThickness];

export function Elevator({ anomaly }: { anomaly: Anomaly | null }) {
  const displayWrong = anomaly?.kind === "display-wrong";
  const camera = useThree((state) => state.camera);
  const setFloorNumber = useGameStore((state) => state.setFloorNumber);
  const startFloor = useGameStore.getState().floorNumber;
  const elevator = useRef(createElevator(startFloor));
  const [readout, setReadout] = useState(startFloor);
  const arrivedAt = useRef(startFloor);

  // The car starts closed, so this needs no ref read during render.
  const wasPhase = useRef<ElevatorPhase>("closed");
  const motor = useRef<{ stop: () => void } | null>(null);

  // The car outlives no component but this one, so its motor stops here.
  useEffect(() => () => motor.current?.stop(), []);

  useFrame((_, delta) => {
    // A paused game freezes the car. Left running it would travel through the
    // pause and open onto a different floor while the player is in the menu,
    // and ring its bell there.
    if (useGameStore.getState().phase !== "playing") return;

    const state = elevator.current;
    stepElevator(state, Math.min(delta, 0.05), ELEVATOR_CONFIG);

    // Sound follows the state machine's transitions rather than polling, so
    // each one fires exactly once.
    if (state.phase !== wasPhase.current) {
      const was = wasPhase.current;
      wasPhase.current = state.phase;

      if (state.phase === "opening" || state.phase === "closing") {
        audio.slide(ELEVATOR_CONFIG.openTime, SOUND_AT);
      }
      if (state.phase === "travelling") {
        motor.current = audio.motor();
      } else if (was === "travelling") {
        motor.current?.stop();
        motor.current = null;
        audio.ding(SOUND_AT);
      }
    }

    const shown = displayFloor(state);
    if (shown !== readout) setReadout(shown);

    // The floor only changes on arrival. Driving it from the readout would
    // rebuild the whole level on every tick of the journey.
    if (state.floor !== arrivedAt.current) {
      arrivedAt.current = state.floor;
      setFloorNumber(state.floor);
      // Arriving on floor zero is the moment the lift stops answering. Set on
      // arrival rather than on the press, so the doors open before the player
      // learns they cannot leave.
      if (state.floor === ENDING_FLOOR) useGameStore.getState().setTrapped();
    }
  });

  const doorProgress = useCallback(() => elevator.current.doors, []);
  const call = useCallback(() => {
    audio.click(SOUND_AT);
    callElevator(elevator.current, ELEVATOR_CONFIG);
  }, []);

  const trapped = useGameStore((state) => state.trapped);

  /**
   * A hotel lift, until it is not.
   *
   * Before the player reaches floor zero this behaves like any other: press a
   * floor and the car goes. Afterwards no button lights at all, which is the
   * premise rather than a puzzle. They did not choose to be down here and
   * cannot simply press five to leave.
   */
  const press = useCallback((floor: number) => {
    if (trapped) {
      // A dead press still makes the sound of a press. Silence would read as
      // the game having missed the input rather than the lift refusing it.
      audio.click(SOUND_AT);
      return;
    }
    audio.click(SOUND_AT);
    requestFloor(elevator.current, floor, ELEVATOR_CONFIG);
  }, [trapped]);

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

      {/* Turned to face the corridor. Seen from behind, a 5 reads as a 2. */}
      <group position={DISPLAY_POSITION} rotation={[0, Math.PI, 0]}>
        {/* One floor out, and only ever upward: a lift claiming a floor below
            the one it can reach is a broken prop, while one claiming to be
            higher than it is is a lift that is lying. The room numbers on the
            doors are what gives it away. */}
        <SevenSegment value={String(displayWrong ? readout + 1 : readout)} />
      </group>

      {/* Call plate in the lobby, beside the doors. */}
      <group position={[0.78, 1.15, ELEVATOR.frontZ - 0.03]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.metal} scale={[0.11, 0.16, 0.015]} />
        <PanelButton position={[0, 0, -0.014]} prompt="Call elevator" onPress={call} />
      </group>

      {/* Interior panel. */}
      <group position={PANEL_POSITION} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.metal} scale={[0.17, 0.56, 0.02]} />
        {/* An ordinary hotel panel. Pressing 0 is the accident the whole
            game turns on, so it sits among the others rather than apart. */}
        {ELEVATOR_CONFIG.servedFloors.map((floor, index) => (
          <PanelButton
            key={floor}
            position={[0, 0.22 - index * 0.072, 0.014]}
            prompt={trapped ? "The button does not light" : `Floor ${floor}`}
            onPress={() => press(floor)}
            lit={!trapped && readout === floor}
            active={!trapped}
          />
        ))}

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
