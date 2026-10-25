const loadRecorderInEachTest = () => vi.importActual<typeof import("./runRecorder")>("./runRecorder");

describe("Run recorder", () => {
  test("percentiles are nearest-rank over frame and tick gaps, and slow frames and late ticks count gaps past 50 ms and 700 ms", async () => {
    const { RunRecorder } = await loadRecorderInEachTest();
    const recorder = new RunRecorder();
    const frameGaps = [...Array<number>(90).fill(16), 20, 20, 20, 20, 20, 33, 33, 33, 51, 120];
    let at = 1000;
    recorder.frame(at);
    for (const gap of frameGaps) recorder.frame((at += gap));
    for (const tickAt of [0, 600, 1200, 1850, 3000.25, 3250, 3850]) recorder.tick(tickAt);

    expect(recorder.timings()).toEqual({
      frames: 100,
      frameMedianMs: 16,
      frameP95Ms: 20,
      frameP99Ms: 51,
      framesOver50Ms: 2,
      runTicks: 6,
      tickMedianMs: 600,
      tickP95Ms: 1150,
      tickMaxMs: 1150.3,
      lateTicks: 1,
    });
  });

  test("an excluded pause is taken out of the frame and tick gaps that span it", async () => {
    const { RunRecorder } = await loadRecorderInEachTest();
    const recorder = new RunRecorder();
    [0, 16, 32].forEach((at) => recorder.frame(at));
    [0, 600].forEach((at) => recorder.tick(at));
    recorder.excludePause(60_000);
    [60_048, 60_064].forEach((at) => recorder.frame(at));
    [61_200, 61_800].forEach((at) => recorder.tick(at));
    expect(recorder.timings()).toEqual({
      frames: 4,
      frameMedianMs: 16,
      frameP95Ms: 16,
      frameP99Ms: 16,
      framesOver50Ms: 0,
      runTicks: 3,
      tickMedianMs: 600,
      tickP95Ms: 600,
      tickMaxMs: 600,
      lateTicks: 0,
    });
  });

  test("a gap past the last bucket still counts and reports the true maximum", async () => {
    const { RunRecorder } = await loadRecorderInEachTest();
    const recorder = new RunRecorder();
    [0, 16, 32, 2032].forEach((at) => recorder.frame(at));
    [0, 9000].forEach((at) => recorder.tick(at));
    expect(recorder.timings()).toEqual({
      frames: 3,
      frameMedianMs: 16,
      frameP95Ms: 500,
      frameP99Ms: 500,
      framesOver50Ms: 1,
      runTicks: 1,
      tickMedianMs: 5000,
      tickP95Ms: 5000,
      tickMaxMs: 9000,
      lateTicks: 1,
    });
  });
});

export {};
