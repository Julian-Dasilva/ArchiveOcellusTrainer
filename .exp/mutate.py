#!/usr/bin/env python3
"""Apply or restore one product mutation in a trainer checkout: mutate.py ROOT NAME apply|restore."""
import sys, pathlib
MUTATIONS = {
    "no-mark-glow": ("src/content/ocellus/js/entities/ExplosionViews.ts",
        "    this.region.addEntity(view);\n    this.live.set(",
        "    this.live.set("),
    "marks-outlive-run": ("src/content/ocellus/js/entities/ExplosionViews.ts",
        "    this.live.forEach((view) => {\n      view.dying = 0;\n    });\n    this.live.clear();",
        "    this.live.clear();"),
    "late-orb-chime": ("src/content/ocellus/js/entities/P4Views.ts",
        "    if (this.playing === null && cue !== null) this.playing",
        "    if (this.playing === null && cue !== null && tickPercent >= 0.5) this.playing"),
    "late-rift-sound": ("src/content/ocellus/js/mobs/VoidRift.ts",
        "CacheRenderReferences.npc(RIFT.npcId.value));",
        "CacheRenderReferences.npc(RIFT.npcId.value), { frameSoundDelayMs: 300 });"),
    "first-click-wins": ("node_modules/osrs-sdk/_bundles/main.js",
        "        due.forEach(function (action) { return action.run(); });",
        "        due.slice(0, 1).forEach(function (action) { return action.run(); });"),
}
root, name, mode = sys.argv[1:4]
path, original, mutated = MUTATIONS[name]
f = pathlib.Path(root) / path
text = f.read_text()
before, after = (original, mutated) if mode == "apply" else (mutated, original)
if text.count(before) != 1:
    sys.exit(f"{name} {mode}: expected one match in {path}, found {text.count(before)}")
f.write_text(text.replace(before, after))
print(f"{name} {mode}: {path}")
