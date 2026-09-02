export type InputAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "sprint"
  | "crouch"
  | "interact"
  | "flashlight"
  | "record"
  | "review"
  | "stats";

/** Keyed by KeyboardEvent.code (physical position) so WASD survives AZERTY. */
const BINDINGS: Readonly<Record<string, InputAction>> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  ControlLeft: "crouch",
  ControlRight: "crouch",
  KeyC: "crouch",
  KeyE: "interact",
  KeyF: "flashlight",
  KeyQ: "record",
  KeyR: "review",
  Backquote: "stats",
};

/** Keys the browser would otherwise scroll the page with. */
const SWALLOW = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

/**
 * Keyboard state. No React and no Three.js, so it can be tested directly.
 * Handlers are instance fields, which keeps addEventListener de-duplicating
 * under StrictMode's double-mount.
 */
export class InputManager {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();

  isDown(action: InputAction): boolean {
    return this.held.has(action);
  }

  /** True once per physical press. Used for toggles like the flashlight. */
  consumePress(action: InputAction): boolean {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  /** Signed axis, so movement code reads as one expression. */
  axis(negative: InputAction, positive: InputAction): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }

  private readonly onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    const action = BINDINGS[key.code];
    if (!action) return;
    if (SWALLOW.has(key.code)) event.preventDefault();
    // Auto-repeat must not re-arm a one-shot press.
    if (!this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
  };

  private readonly onKeyUp = (event: Event) => {
    const action = BINDINGS[(event as KeyboardEvent).code];
    if (action) this.held.delete(action);
  };

  /** Losing focus mid-stride would otherwise leave the player walking forever. */
  private readonly onBlur = () => this.clear();

  attach(target: EventTarget): () => void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
    return () => {
      target.removeEventListener("keydown", this.onKeyDown);
      target.removeEventListener("keyup", this.onKeyUp);
      target.removeEventListener("blur", this.onBlur);
      this.clear();
    };
  }
}

/** One keyboard, one instance. */
export const input = new InputManager();
