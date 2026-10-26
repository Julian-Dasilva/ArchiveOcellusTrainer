(() => {
  if (window.__frameClock) return;
  const clock = (window.__frameClock = { tickMs: 600, frame: null, starts: { fight: {}, world: {} }, due: [], done: {}, audio: null });
  const nativeFrame = window.requestAnimationFrame.bind(window);
  // The world loop runs in an animation frame and starts each tick at that frame's timestamp, so a frame-stamped reading shares its clock.
  window.requestAnimationFrame = (callback) =>
    nativeFrame((now) => {
      clock.frame = now;
      try {
        callback(now);
      } finally {
        clock.frame = null;
      }
    });

  const ticksAt = (now) => {
    const snapshot = window.__archiveOcellusProbe?.snapshot(), run = snapshot?.fight?.run;
    const ticks = { fight: run?.kind === "running" ? run.tick : run?.kind === "ended" ? run.at : null, world: snapshot?.tick ?? null };
    for (const kind of ["fight", "world"]) if (ticks[kind] !== null) clock.starts[kind][ticks[kind]] ??= now;
    return ticks;
  };
  const into = (kind, tick, now) => (now - clock.starts[kind][tick]) / clock.tickMs;

  const encode = (canvas) =>
    canvas.convertToBlob({ type: "image/png" }).then((blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }));
  const perform = {
    shot: (_action, done) => {
      const world = document.querySelector("#world"), box = world.getBoundingClientRect();
      const page = new OffscreenCanvas(window.innerWidth, window.innerHeight);
      page.getContext("2d").drawImage(world, box.x, box.y, box.width, box.height);
      done.png = null;
      encode(page).then((png) => (done.png = png));
    },
    click: (action) => {
      const world = document.querySelector("#world");
      for (const type of ["mousedown", "mouseup"]) {
        world.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === "mousedown" ? 1 : 0, clientX: action.x, clientY: action.y }));
      }
    },
  };

  const watch = (now) => {
    nativeFrame(watch);
    const ticks = ticksAt(now);
    clock.due = clock.due.filter(({ when, action }) => {
      const t = ticks[when.kind];
      if (t === null || t < when.tick || (t === when.tick && into(when.kind, t, now) < when.fraction)) return true;
      const done = (clock.done[action.name] = { tick: t, into: Math.round(into(when.kind, t, now) * 1000) / 1000 });
      perform[action.kind](action, done);
      return false;
    });
  };
  nativeFrame(watch);

  clock.at = (when, action) => {
    delete clock.done[action.name];
    clock.due.push({ when, action });
  };

  clock.recordAudio = () => {
    const starts = (clock.audio = []), start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const now = clock.frame ?? performance.now(), t = ticksAt(now).fight;
      starts.push({ tick: t, phase: t === null ? null : Math.round(into("fight", t, now) * 100) / 100, samples: this.buffer?.length ?? null, rate: this.buffer?.sampleRate ?? null, state: this.context.state });
      return start.apply(this, args);
    };
  };
})();
