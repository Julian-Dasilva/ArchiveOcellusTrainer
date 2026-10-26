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

  // createImageBitmap copies the canvas when called, before its promise resolves.
  const frame = (kind, tick, now) => {
    const world = document.querySelector("#world");
    return { at: at(kind, tick, now), bitmap: createImageBitmap(world), box: world.getBoundingClientRect() };
  };
  const release = (shot) => shot?.bitmap.then((bitmap) => bitmap.close());
  const encode = ({ name, shot }) =>
    shot.bitmap
      .then((bitmap) => {
        const page = new OffscreenCanvas(window.innerWidth, window.innerHeight);
        page.getContext("2d").drawImage(bitmap, shot.box.x, shot.box.y, shot.box.width, shot.box.height);
        return page.convertToBlob({ type: "image/png" });
      })
      .then((blob) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }))
      .then((png) => (clock.done[name] = { ...shot.at, png }));
  let copied = [];

  const click = ({ x, y }) => {
    const world = document.querySelector("#world");
    for (const type of ["mousedown", "mouseup"]) {
      world.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === "mousedown" ? 1 : 0, clientX: x, clientY: y }));
    }
  };

  // The world loop starts each tick at its animation frame's timestamp, so the frames that follow it read the tick's start on the same clock.
  const watch = (now) => {
    requestAnimationFrame(watch);
    const ticks = ticksAt(now);
    clock.due = clock.due.filter((due) => {
      const { when, action } = due, t = ticks[when.kind];
      if (t === null || t < when.tick) return true;
      if (t === when.tick && into(when.kind, t, now) < when.fraction) {
        if (action.kind === "shot") {
          release(due.onScreenAtFraction);
          due.onScreenAtFraction = frame(when.kind, t, now);
        }
        return true;
      }
      switch (action.kind) {
        case "shot":
          if (t > when.tick && due.onScreenAtFraction) copied.push({ name: action.name, when, shot: due.onScreenAtFraction });
          else {
            release(due.onScreenAtFraction);
            copied.push({ name: action.name, when, shot: frame(when.kind, t, now) });
          }
          break;
        case "click":
          click(action);
          clock.done[action.name] = at(when.kind, t, now);
          break;
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
    AudioBufferSourceNode.prototype.start = function (...args) {
      const now = document.timeline.currentTime, t = ticksAt(now).fight;
      starts.push({ tick: t, phase: t === null ? null : Math.round(into("fight", t, now) * 100) / 100, samples: this.buffer?.length ?? null, rate: this.buffer?.sampleRate ?? null, state: this.context.state });
      return start.apply(this, args);
    };
  };
})();
