import { SoundCache } from "osrs-sdk";
import { keepHoverTextOnCanvas } from "./hoverText";
import { FullFightPage } from "./content/ocellus/full/page";

keepHoverTextOnCanvas();
// Desktop browsers start the SDK's AudioContext suspended until a user gesture, and the SDK never resumes it.
window.addEventListener("pointerdown", () => void SoundCache.context?.resume(), { capture: true });
// Cache 2746 has no synth for three of phase 2's animation frame sounds (12814, 12825, 12832), and the SDK rejects a promise when a frame reaches one.
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error && /^Sound effect \d+ is not present in the runtime pack$/.test(event.reason.message)) event.preventDefault();
});

export const ArchiveOcellusApp = FullFightPage;
