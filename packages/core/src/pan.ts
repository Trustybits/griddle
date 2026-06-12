// PanController — headless camera for loop mode. No DOM, no timers.
//
// The controller owns an unbounded 2D camera offset. Three inputs move it:
// - dragStart/dragMove/dragEnd: pointer-driven panning. While dragging, the
//   target follows the pointer 1:1 (inverted — content follows the finger)
//   and a velocity estimate is kept; on release the target keeps coasting
//   under exponential friction (inertia/fling).
// - scrollBy: external deltas (wheel/trackpad). Applied directly to both
//   camera and target — the browser already smooths these.
// - tick(now): advances easing + inertia. Adapters call this from their rAF
//   loop and apply the camera to the plane's CSS transform.
//
// All rates are per-second (exponential, frame-rate independent).

export interface CameraState {
  /** Unbounded camera offset, px. */
  x: number;
  y: number;
  /** Velocity estimate, px/s. */
  vx: number;
  vy: number;
  /** True while the camera is still easing/coasting toward its target. */
  isMoving: boolean;
  /** True between dragStart and dragEnd. */
  isDragging: boolean;
}

export interface PanPhysicsOptions {
  /** Inertia velocity decay rate after release, 1/s. Default 4. */
  friction?: number;
  /** Camera approach rate toward the target, 1/s. Default 12. */
  ease?: number;
  /** Fling velocity clamp, px/s. Default 6000. */
  maxVelocity?: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

const SETTLE_DISTANCE = 0.1; // px
const SETTLE_VELOCITY = 5; // px/s
const VELOCITY_WINDOW_MS = 100;

export class PanController {
  private friction: number;
  private ease: number;
  private maxVelocity: number;

  private x = 0;
  private y = 0;
  private targetX = 0;
  private targetY = 0;
  private vx = 0;
  private vy = 0;

  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private samples: Sample[] = [];
  private lastTick: number | null = null;

  constructor(physics: PanPhysicsOptions = {}) {
    this.friction = physics.friction ?? 4;
    this.ease = physics.ease ?? 12;
    this.maxVelocity = physics.maxVelocity ?? 6000;
  }

  setPhysics(physics: PanPhysicsOptions): void {
    if (physics.friction !== undefined) this.friction = physics.friction;
    if (physics.ease !== undefined) this.ease = physics.ease;
    if (physics.maxVelocity !== undefined) this.maxVelocity = physics.maxVelocity;
  }

  state(): CameraState {
    const settled =
      Math.abs(this.targetX - this.x) < SETTLE_DISTANCE &&
      Math.abs(this.targetY - this.y) < SETTLE_DISTANCE &&
      Math.abs(this.vx) < SETTLE_VELOCITY &&
      Math.abs(this.vy) < SETTLE_VELOCITY;
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      isMoving: this.dragging || !settled,
      isDragging: this.dragging,
    };
  }

  /** Begin a pan gesture at pointer position (px, py), in any stable pixel space. */
  dragStart(px: number, py: number, now: number): void {
    this.dragging = true;
    this.lastPointer = { x: px, y: py };
    this.samples = [{ t: now, x: px, y: py }];
    // Grabbing the plane stops any in-flight coast.
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  /** Pointer moved during a pan gesture. */
  dragMove(px: number, py: number, now: number): void {
    if (!this.dragging || !this.lastPointer) return;
    // Content follows the finger: camera moves opposite the pointer delta.
    this.targetX -= px - this.lastPointer.x;
    this.targetY -= py - this.lastPointer.y;
    this.lastPointer = { x: px, y: py };
    this.samples.push({ t: now, x: px, y: py });
    while (this.samples.length > 2 && now - this.samples[0]!.t > VELOCITY_WINDOW_MS) {
      this.samples.shift();
    }
  }

  /** End the pan gesture, converting recent pointer motion into a fling. */
  dragEnd(now: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.lastPointer = null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (first && last && last.t > first.t) {
      const dt = (last.t - first.t) / 1000;
      // Pointer velocity, inverted into camera space.
      let vx = -(last.x - first.x) / dt;
      let vy = -(last.y - first.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > this.maxVelocity) {
        const s = this.maxVelocity / speed;
        vx *= s;
        vy *= s;
      }
      this.vx = vx;
      this.vy = vy;
    }
    this.samples = [];
  }

  /** Abort a drag without inertia. */
  dragCancel(): void {
    this.dragging = false;
    this.lastPointer = null;
    this.samples = [];
    this.vx = 0;
    this.vy = 0;
  }

  /** External scroll delta (native scroll / wheel). Applied directly. */
  scrollBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.targetX += dx;
    this.targetY += dy;
  }

  /** Jump the camera (and target) to an absolute offset. Kills motion. */
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vx = 0;
    this.vy = 0;
  }

  /** Stop all motion at the current offset. */
  stop(): void {
    this.targetX = this.x;
    this.targetY = this.y;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Advance the simulation to time `now` (ms). Returns the camera state.
   * Call once per animation frame.
   */
  tick(now: number): CameraState {
    const last = this.lastTick ?? now;
    this.lastTick = now;
    let dt = (now - last) / 1000;
    if (dt <= 0) return this.state();
    if (dt > 0.1) dt = 0.1; // clamp long gaps (tab switch) to avoid jumps

    if (!this.dragging) {
      // Inertia: the target coasts and the velocity decays exponentially.
      const decay = Math.exp(-this.friction * dt);
      if (Math.abs(this.vx) > SETTLE_VELOCITY || Math.abs(this.vy) > SETTLE_VELOCITY) {
        // Integrate v over the step: x += v/friction * (1 - decay)
        const integral = this.friction > 0 ? (1 - decay) / this.friction : dt;
        this.targetX += this.vx * integral;
        this.targetY += this.vy * integral;
        this.vx *= decay;
        this.vy *= decay;
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }

    // Ease the camera toward the target (frame-rate independent lerp).
    const k = 1 - Math.exp(-this.ease * dt);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    if (
      Math.abs(this.targetX - this.x) < SETTLE_DISTANCE &&
      Math.abs(this.targetY - this.y) < SETTLE_DISTANCE
    ) {
      this.x = this.targetX;
      this.y = this.targetY;
    }

    return this.state();
  }
}
