# Credit line

The policy strip along the bottom of the page, under the game view and the side panel, always shows the Jagex Fan Content Policy credit. The trainer must keep it visible for as long as it uses cache assets.

## Sub-features

- `credit-text` shows the exact credit sentence from the README.
- `credit-visible` keeps the credit visible in `#policy_footer`, a grid row of its own under the canvas, so it never covers the game view.

## How to get to it (user POV)

- Open the trainer and look at the strip along the bottom of the page.

## Driving it with agent-browser

Preconditions:

- The baseline preconditions in the index hold.

- **Text.** Read the credit. Run `agent-browser --json get text "#credit_line"`. `data.text` is exactly `CREDIT_LINE` from `scripts/verify.sh`: `Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.`
- **Visible.** Run `agent-browser --json is visible "#credit_line"`. `data.visible` is `true`.
- **Proof.** Take a screenshot with an absolute path. The credit appears in the strip at the bottom left, under the makers' credits.
- **Scripted.** `scripts/verify.sh browser` checks the text and the visibility in the `p4_cycle` unit's walk step, before it clicks.

## Gotchas

- The credit is a DOM element in the footer, not canvas text, so `get text` reads it directly.
- On a phone the side panel opens over the game view, and the footer paints above it, so the credit stays visible with the menu open.
