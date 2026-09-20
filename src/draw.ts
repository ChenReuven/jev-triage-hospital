import type { Hospital } from "./hospital";

export function draw(
  ctx: CanvasRenderingContext2D,
  _hospital: Hospital,
  width: number,
  height: number,
): void {
  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);
}
