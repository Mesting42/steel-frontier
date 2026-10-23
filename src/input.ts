import type { BattleInput } from "./battle";
import type { V2 } from "./math";
import { clamp, norm } from "./math";
/** 键鼠和双摇杆产出同一种输入。一次性动作在读取后清除，按住射击跨帧保留。 */
export class Input {
  keys = new Set<string>();
  pointer = { x: innerWidth / 2, y: innerHeight / 3 };
  mouseDown = false;
  moveStick: V2 = { x: 0, z: 0 };
  aimStick: V2 = { x: 0, z: 0 };
  touchAiming = false;
  dash = false;
  skill = false;
  swap = false;
  enabled = false;
  onPause = () => {};
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof Element &&
        e.target.matches("input,select,textarea")
      )
        return;
      if (
        [
          "Space",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyQ",
          "KeyE",
          "Escape",
        ].includes(e.code) &&
        this.enabled
      )
        e.preventDefault();
      if (e.code === "Escape" && !e.repeat) this.onPause();
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (!e.repeat) {
        if (e.code === "Space") this.dash = true;
        if (e.code === "KeyE") this.skill = true;
        if (e.code === "KeyQ") this.swap = true;
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
      }
    });
    window.addEventListener("pointerdown", (e) => {
      if (
        e.pointerType === "mouse" &&
        e.button === 0 &&
        e.target instanceof HTMLCanvasElement
      )
        this.mouseDown = true;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") this.mouseDown = false;
    });
    window.addEventListener("blur", () => this.clear());
  }
  read(player: V2, mouseAim: V2): BattleInput {
    let move = this.moveStick;
    if (
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD")
    )
      move = norm(
        Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
        Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW")),
      );
    const aim = this.touchAiming
      ? {
          x: player.x + this.aimStick.x * 22,
          z: player.z + this.aimStick.z * 22,
        }
      : mouseAim;
    const result = {
      move: { ...move },
      aim,
      firing:
        this.mouseDown ||
        (this.touchAiming &&
          Math.hypot(this.aimStick.x, this.aimStick.z) > 0.18),
      dash: this.dash,
      skill: this.skill,
      swap: this.swap,
    };
    this.dash = this.skill = this.swap = false;
    return result;
  }
  clear() {
    this.keys.clear();
    this.mouseDown = false;
    this.moveStick = { x: 0, z: 0 };
    this.aimStick = { x: 0, z: 0 };
    this.touchAiming = false;
    this.dash = this.skill = this.swap = false;
  }
  bindTouch(root: HTMLElement) {
    for (const side of ["move", "aim"] as const) {
      const element = root.querySelector<HTMLElement>(`[data-stick="${side}"]`);
      if (!element) continue;
      let pointerId: number | null = null;
      const update = (e: PointerEvent) => {
        const r = element.getBoundingClientRect(),
          radius = r.width * 0.35;
        let x = (e.clientX - r.x - r.width / 2) / radius,
          z = (e.clientY - r.y - r.height / 2) / radius;
        const len = Math.hypot(x, z);
        if (len > 1) {
          x /= len;
          z /= len;
        }
        const v = {
          x: Math.abs(x) < 0.08 ? 0 : x,
          z: Math.abs(z) < 0.08 ? 0 : z,
        };
        if (side === "move") this.moveStick = v;
        else {
          this.aimStick = v;
          this.touchAiming = true;
        }
        const knob = element.querySelector<HTMLElement>("i")!;
        knob.style.transform = `translate(${clamp(x, -1, 1) * radius}px,${clamp(z, -1, 1) * radius}px)`;
      };
      element.addEventListener("pointerdown", (e) => {
        if (pointerId !== null) return;
        e.preventDefault();
        pointerId = e.pointerId;
        try {
          element.setPointerCapture(pointerId);
        } catch {
          /* 指针在界面切换时可能已释放，局部拖动仍可正常处理。 */
        }
        update(e);
      });
      element.addEventListener("pointermove", (e) => {
        if (e.pointerId === pointerId) update(e);
      });
      const release = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        if (side === "move") this.moveStick = { x: 0, z: 0 };
        else {
          this.aimStick = { x: 0, z: 0 };
          this.touchAiming = false;
        }
        element.querySelector<HTMLElement>("i")!.style.transform = "";
      };
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
    }
    for (const action of ["dash", "skill", "swap"] as const)
      root
        .querySelector(`[data-touch="${action}"]`)
        ?.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this[action] = true;
        });
  }
}
