(() => {
  if (location.hash !== "#perf") return;
  const SETTINGS = "osrs-sdk:settings";
  const saved = JSON.parse(localStorage.getItem(SETTINGS) ?? '{"version":1,"values":{}}');
  saved.values = { ...saved.values, playsAudio: false, playsAreaAudio: false };
  localStorage.setItem(SETTINGS, JSON.stringify(saved));

  const frames = [];
  const ticks = [];
  const draws = [];
  const heap = [];
  const errors = [];
  const largestCanvas = { width: 0, height: 0 };
  let renderer = null;
  let scene = null;
  let region = null;

  addEventListener("error", (event) => errors.push(String(event.message)));
  addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

  const noteCanvas = (canvas) => {
    if (canvas.width * canvas.height > largestCanvas.width * largestCanvas.height) Object.assign(largestCanvas, { width: canvas.width, height: canvas.height });
  };
  for (const Canvas of [OffscreenCanvas, HTMLCanvasElement]) {
    for (const side of ["width", "height"]) {
      const { get, set } = Object.getOwnPropertyDescriptor(Canvas.prototype, side);
      Object.defineProperty(Canvas.prototype, side, {
        configurable: true,
        get,
        set(value) {
          set.call(this, value);
          noteCanvas(this);
        },
      });
    }
  }
  const NativeOffscreenCanvas = OffscreenCanvas;
  window.OffscreenCanvas = class extends NativeOffscreenCanvas {
    constructor(width, height) {
      super(width, height);
      noteCanvas(this);
    }
  };

  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener("observe", ({ detail }) => {
    if (detail?.isWebGLRenderer !== true) return;
    const render = detail.render;
    detail.render = function (...args) {
      const out = Reflect.apply(render, this, args);
      // The SDK's model warm-up renders once into a throwaway 1x1 canvas; only the viewport's renders count.
      if (this.domElement.width * this.domElement.height > 1) {
        renderer = this;
        scene = args[0];
        draws.push([performance.now(), this.info.render.calls, this.info.render.triangles]);
      }
      return out;
    };
  });

  // World.browserLoop binds itself every frame, which hands over the world the build keeps private.
  const bind = Function.prototype.bind;
  Function.prototype.bind = function (self, ...rest) {
    if (typeof self?.globalTickCounter === "number" && typeof self.tickWorld === "function") {
      Function.prototype.bind = bind;
      region = self.regions[0];
      const tickWorld = self.tickWorld;
      self.tickWorld = function (...args) {
        const at = performance.now();
        const out = Reflect.apply(tickWorld, this, args);
        const run = region.snapshot()?.run;
        let sceneObjects = 0;
        scene?.traverse(() => sceneObjects++);
        ticks.push({
          at,
          p4: run?.kind === "running" ? run.tick : null,
          stage: run?.kind === "running" ? run.phase.stage : null,
          world: { mobs: region.mobs.length, entities: region.entities.length, projectiles: region.projectiles.length },
          renderer: renderer && scene ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, sceneObjects } : null,
        });
        return out;
      };
    }
    return Reflect.apply(bind, this, [self, ...rest]);
  };

  const frame = (now) => {
    frames.push(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const p4Tick = () => ticks.findLast(({ p4 }) => p4 !== null)?.p4 ?? -1;
  window.__perfGate = Object.freeze({
    p4Tick,
    noteHeap: (usedBytes, backingBytes) => heap.push({ p4: p4Tick(), usedBytes, backingBytes }),
    capture: () => ({
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      frames,
      ticks,
      draws,
      heap,
      largestCanvas,
      // One tick per retired rift. A burst names every rift it retires; a base build before that logged one burst per rift.
      retired: (region?.fightLog().rows ?? [])
        .flatMap((row) => row.events)
        .flatMap((event) => (event.kind === "rift-destroyed" ? [event.at] : event.kind === "rift-burst" ? (event.rifts ?? [event.rift]).map(() => event.at) : [])),
      errors,
    }),
  });
})();
