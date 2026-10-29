(() => {
  if (window.__frameClock) return;
  const clock = (window.__frameClock = { tickMs: 600, starts: { fight: {}, world: {} }, due: [], done: {}, audio: null });

  const ticksAt = (now) => {
    const snapshot = window.__archiveOcellusProbe?.snapshot(), run = snapshot?.fight?.run;
    const ticks = { fight: run?.kind === "running" ? run.tick : run?.kind === "ended" ? run.at : null, world: snapshot?.tick ?? null };
    for (const kind of ["fight", "world"]) if (ticks[kind] !== null) clock.starts[kind][ticks[kind]] ??= now;
    return ticks;
  };
  const into = (kind, tick, now) => (now - clock.starts[kind][tick]) / clock.tickMs;
  const at = (kind, tick, now) => ({ tick, into: Math.round(into(kind, tick, now) * 1000) / 1000 });

  // The 3D view draws into its own canvas under #world, so a shot copies every canvas beside #world and stacks them in page order, as the screen does.
  // createImageBitmap copies the canvas when called, before its promise resolves.
  const frame = (kind, tick, now) => {
    const world = document.querySelector("#world");
    const layers = [...world.parentElement.querySelectorAll(":scope > canvas")].filter((canvas) => !canvas.hidden);
    return { at: at(kind, tick, now), box: world.getBoundingClientRect(), layers: layers.map((layer) => ({ bitmap: createImageBitmap(layer), box: layer.getBoundingClientRect() })) };
  };
  const release = (shot) => shot?.layers.forEach(({ bitmap }) => bitmap.then((copy) => copy.close()));
  // preserveDrawingBuffer is off, so this canvas is blank on a frame the 3D view did not draw.
  // The read has to be the default framebuffer. A bound target can hold color while the canvas itself is empty.
  const sceneDrawn = () => {
    const world = document.querySelector("#world");
    const canvas = world?.parentElement && [...world.parentElement.querySelectorAll(":scope > canvas")].find((layer) => layer !== world && !layer.hidden && layer.getContext("webgl2"));
    if (!canvas) return true;
    const gl = canvas.getContext("webgl2");
    if (!gl || gl.isContextLost() || canvas.width < 2 || canvas.height < 2) return false;
    const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixel = new Uint8Array(4);
    let drawn = false;
    for (const y of [0.38, 0.48, 0.58]) {
      for (const x of [0.42, 0.5, 0.58]) {
        gl.readPixels(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel[0] + pixel[1] + pixel[2] > 12) { drawn = true; break; }
      }
      if (drawn) break;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
    return drawn;
  };
  const encode = ({ name, when, shot }) =>
    Promise.all(shot.layers.map(({ bitmap }) => bitmap))
      .then((bitmaps) => {
        const page = new OffscreenCanvas(window.innerWidth, window.innerHeight), context = page.getContext("2d");
        context.fillStyle = "black";
        context.fillRect(shot.box.x, shot.box.y, shot.box.width, shot.box.height);
        bitmaps.forEach((bitmap, i) => context.drawImage(bitmap, shot.layers[i].box.x, shot.layers[i].box.y, shot.layers[i].box.width, shot.layers[i].box.height));
        return page.convertToBlob({ type: "image/png" });
      })
      .then((blob) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }))
      .then((png) => (clock.done[name] = { ...shot.at, planned: when.fraction, png }));
  let copied = [];

  const click = ({ x, y }) => {
    const world = document.querySelector("#world");
    if (document.elementFromPoint(x, y) !== world) return false;
    for (const type of ["mousedown", "mouseup"]) {
      world.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === "mousedown" ? 1 : 0, clientX: x, clientY: y }));
    }
    return true;
  };

  // The world loop starts each tick at its animation frame's timestamp, so the frames that follow it read the tick's start on the same clock.
  const watch = (now) => {
    requestAnimationFrame(watch);
    const ticks = ticksAt(now);
    const shotReady = clock.due.some((due) => due.action.kind === "shot" && (ticks[due.when.kind] ?? -1) >= due.when.tick);
    const drawn = shotReady && sceneDrawn();
    clock.due = clock.due.filter((due) => {
      const { when, action } = due, t = ticks[when.kind];
      if (t === null || t < when.tick) return true;
      const phase = into(when.kind, t, now);
      if (action.kind === "shot") {
        if (!drawn) {
          if (t > when.tick && due.onScreenAtFraction) {
            copied.push({ name: action.name, when, shot: due.onScreenAtFraction });
            return false;
          }
          if (t > when.tick + 1) {
            clock.done[action.name] = { dropped: "no-drawn-frame" };
            return false;
          }
          return true;
        }
        const shot = frame(when.kind, t, now);
        if (t === when.tick && phase < when.fraction) {
          release(due.onScreenAtFraction);
          due.onScreenAtFraction = shot;
          return true;
        }
        const early = due.onScreenAtFraction;
        const earlyCloser = early && t === when.tick && Math.abs(early.at.into - when.fraction) < Math.abs(shot.at.into - when.fraction);
        const chosen = early && (earlyCloser || t !== when.tick) ? early : shot;
        release(chosen === early ? shot : early);
        copied.push({ name: action.name, when, shot: chosen });
        return false;
      }
      if (t === when.tick && phase < when.fraction) return true;
      switch (action.kind) {
        case "click":
          if (click(action)) clock.done[action.name] = at(when.kind, t, now);
          else clock.done[action.name] = { hit: false, reason: "covered" };
          break;
        case "log":
          clock.done[action.name] = { log: window.__archiveOcellusProbe.log() };
          break;
        default: {
          const unhandled = action.kind;
          throw new Error(`frame clock cannot run ${unhandled}`);
        }
      }
      return false;
    });
    const tickHasShotsDue = ({ when }) => clock.due.some((due) => due.action.kind === "shot" && due.when.kind === when.kind && due.when.tick === when.tick);
    copied.filter((copy) => !tickHasShotsDue(copy)).forEach(encode);
    copied = copied.filter(tickHasShotsDue);
  };
  requestAnimationFrame(watch);

  clock.at = (when, action) => {
    delete clock.done[action.name];
    clock.due.push({ when, action });
  };

  // document.timeline holds the current frame's timestamp through its callbacks and their promise jobs, where the SDK starts frame sounds.
  clock.recordAudio = () => {
    const starts = (clock.audio = []), start = AudioBufferSourceNode.prototype.start;
    const heapMB = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);
    let seen = { at: null, heap: null }, before = seen;
    const frame = (now) => {
      requestAnimationFrame(frame);
      if (now !== seen.at) [before, seen] = [seen, { at: now, heap: heapMB() }];
    };
    requestAnimationFrame(frame);
    AudioBufferSourceNode.prototype.start = function (...args) {
      const now = document.timeline.currentTime, t = ticksAt(now).fight, previous = seen.at === now ? before : seen, heap = heapMB();
      starts.push({
        tick: t, phase: t === null ? null : Math.round(into("fight", t, now) * 100) / 100, samples: this.buffer?.length ?? null, rate: this.buffer?.sampleRate ?? null, state: this.context.state,
        frameGapMs: previous.at === null ? null : Math.round(now - previous.at),
        heapChangeMB: heap === null || previous.heap === null ? null : Math.round((heap - previous.heap) * 10) / 10,
      });
      return start.apply(this, args);
    };
  };
})();
