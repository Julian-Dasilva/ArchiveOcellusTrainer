const canvasContext = new Proxy({}, {
  get: (target, property) =>
    property === "measureText" ? () => ({ width: 0 })
    : property === "createImageData" ? (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(4 * width * height) })
    : () => undefined,
  set: () => true,
});

global.OffscreenCanvas = class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return canvasContext;
  }
} as unknown as typeof OffscreenCanvas;

HTMLCanvasElement.prototype.getContext = (() => canvasContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;

const offlineFetch = () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
global.fetch = offlineFetch as unknown as typeof fetch;

global.ResizeObserver = class {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    queueMicrotask(() => this.callback([{ contentRect: { width: 800, height: 800 } } as ResizeObserverEntry], this));
  }
  unobserve() {}
  disconnect() {}
};

export {};
