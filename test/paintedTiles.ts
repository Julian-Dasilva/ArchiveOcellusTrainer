export function paintedTiles(paint: (context: OffscreenCanvasRenderingContext2D, scale: number) => void): ReadonlySet<string> {
  const painted = new Set<string>();
  const ignored = () => undefined;
  const context = { fillStyle: "", fillRect: (x: number, y: number) => void painted.add(`${x},${y}`), beginPath: ignored, moveTo: ignored, lineTo: ignored, closePath: ignored, fill: ignored };
  paint(context as unknown as OffscreenCanvasRenderingContext2D, 1);
  return painted;
}

type Shape = Readonly<{ style: string; contains: (x: number, y: number) => boolean }>;

function insidePolygon(corners: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % corners.length];
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  });
  return inside;
}

export function paintedStyleAt(paint: (context: OffscreenCanvasRenderingContext2D, scale: number) => void, scale = 1): (tileX: number, tileY: number) => string | null {
  const shapes: Shape[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: "", globalAlpha: 1 };
  const saved: Record<string | symbol, unknown>[] = [];
  let path: [number, number][] = [];
  const add = (contains: Shape["contains"]) => {
    if (Number(state.globalAlpha) > 0) shapes.push({ style: String(state.fillStyle), contains });
  };
  const methods: Record<string, (...args: number[]) => void> = {
    fillRect: (x, y, width, height) => add((px, py) => px >= x && px < x + width && py >= y && py < y + height),
    beginPath: () => void (path = []),
    moveTo: (x, y) => void path.push([x, y]),
    lineTo: (x, y) => void path.push([x, y]),
    fill: () => {
      const corners = [...path];
      add((px, py) => insidePolygon(corners, px, py));
    },
    save: () => void saved.push({ ...state }),
    restore: () => void Object.assign(state, saved.pop()),
  };
  const context = new Proxy(state, {
    get: (target, property) => (typeof property === "string" && property in methods ? methods[property] : property in target ? target[property] : () => undefined),
    set: (target, property, value) => {
      target[property] = value;
      return true;
    },
  });
  paint(context as unknown as OffscreenCanvasRenderingContext2D, scale);
  return (tileX, tileY) => [...shapes].reverse().find((shape) => shape.contains(tileX * scale, tileY * scale))?.style ?? null;
}

export type Fill = Readonly<{ style: string; x: number; y: number; width: number; height: number }>;

export function paintedFills(paint: (context: OffscreenCanvasRenderingContext2D) => void): readonly Fill[] {
  const fills: Fill[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: "", globalAlpha: 1 };
  const saved: Record<string | symbol, unknown>[] = [];
  const methods: Record<string, (...args: number[]) => void> = {
    fillRect: (x, y, width, height) => {
      if (Number(state.globalAlpha) > 0) fills.push({ style: String(state.fillStyle), x, y, width, height });
    },
    save: () => void saved.push({ ...state }),
    restore: () => void Object.assign(state, saved.pop()),
  };
  const context = new Proxy(state, {
    get: (target, property) => (typeof property === "string" && property in methods ? methods[property] : property in target ? target[property] : () => undefined),
    set: (target, property, value) => {
      target[property] = value;
      return true;
    },
  });
  paint(context as unknown as OffscreenCanvasRenderingContext2D);
  return fills;
}
