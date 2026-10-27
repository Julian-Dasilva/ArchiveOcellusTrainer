# AGENTS.md

## Rules
- Use Node 22.
- Follow the osrs-sdk patterns: `Mob` subclasses for bosses, `Entity` subclasses for ground hazards, a `Region` subclass for the arena, Vitest with the SDK's `TestRegion`/`TestNpc`.
- Keep every boss timing and count in one data file, labelled unverified, with a wiki source per value.
- Never commit extracted cache assets or models. `public/osrs-assets/` is generated at build time.
- Keep the project free: no ads, donations or paid features. Keep the credit line in the README and the app. Keep "RuneScape" and "Jagex" out of names.
- Prove each change with the repository's verification skill before calling it done.
- The verification recipe is `.claude/skills/verify-archive-ocellus/` (`scripts/verify.sh` runs it).
- On an iteration run `scripts/verify.sh t0`. Before handoff run `scripts/verify.sh t1`. The full run is the CI summary. Read it with `scripts/verify.sh ci`.

## PStack
- Before editing, load the `poteto-mode` skill from [PStack](https://github.com/cursor/plugins/tree/main/pstack) and the playbook that matches the task, such as feature, bug-fix or refactoring.
- For TypeScript and type design, apply these PStack principles: type-system-discipline, model-the-domain, foundational-thinking, boundary-discipline, minimize-reader-load, laziness-protocol and test-behavior-not-implementation.
- Code that crosses a function boundary follows PStack's `architect` skill. Implement against the agreed design sketch and report any deviation from it.
- Name the principles that shaped your decisions in your result.

## TypeScript
- These rules apply to new and changed code in `src/`. Test doubles in `test/` may cast at the jsdom boundary.
- No `any`. No `as` casts or non-null `!` to silence the compiler.
- Model stages and events as discriminated unions, and end each `switch` over them with a `never` check.
- Brand primitives that are easy to mix up, such as ticks and tile coordinates.
- Keep timing data `readonly`.
- Do not declare a field optional when it is always set in practice.
