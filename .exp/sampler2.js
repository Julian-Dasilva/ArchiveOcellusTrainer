(() => {
  const clock = window.__frameClock, ticks = new Set(window.__sampleTicks), glowBox = window.__glowBox, shardBox = window.__shardBox;
  const samples = (window.__samples = []);
  const isSpotAnimGlow = (r, g, b) => b >= 110 && b - g >= 35 && r - g >= 25;
  const isShard = (r, g, b) => g <= 35 && b >= 100 && b - r >= 40;
  const share = (ctx, cx, cy, box, test) => {
    const w = box.maxX - box.minX + 1, h = box.maxY - box.minY + 1, d = ctx.getImageData(cx + box.minX, cy + box.minY, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
    return Math.round(100000 * n / (w * h)) / 1000;
  };
  const last = Math.max(...ticks);
  const sample = (now) => {
    const run = window.__archiveOcellusProbe.snapshot().fight?.run, ft = run?.kind === "running" ? run.tick : run?.kind === "ended" ? run.at : null;
    if (ticks.has(ft)) {
      const world = document.querySelector("#world"), ctx = world.getContext("2d"), cx = world.width / 2 | 0, cy = world.height / 2 | 0;
      samples.push({ tick: ft, into: Math.round((now - clock.starts.fight[ft]) / 6) / 100, glow: share(ctx, cx, cy, glowBox, isSpotAnimGlow), shard: share(ctx, cx, cy, shardBox, isShard) });
    }
    if (ft === null || ft <= last) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
})();
