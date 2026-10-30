import React, { useEffect, useSyncExternalStore } from "react";
import { LoadoutEditor, RuneScapeButton } from "osrs-sdk-react";
import type { RunClock } from "../../../sim/sdk/RunClock";
import type { TierLoadout, TierLoadouts } from "../js/OcellusLoadout";
import { OCELLUS_LOADOUTS, SHOP_NOT_SIMULATED, editorChoices } from "../js/OcellusLoadout";

export function useTierLoadout(loadouts: TierLoadouts): TierLoadout {
  return useSyncExternalStore(loadouts.subscribe, loadouts.snapshot);
}

function editCannotLoad({ active, overStock }: TierLoadout): boolean {
  return overStock.length > 0 || (active.source === "preset" && active.refusedEdit.length > 0);
}

const NOT_STOCKED = SHOP_NOT_SIMULATED.map(({ item, quantity }) => (quantity === 1 ? item.name : `${item.name} ×${quantity}`)).join(", ");

type LoadoutSectionProps = Readonly<{ loadouts: TierLoadouts; clock: RunClock; onApply: () => void; open: boolean; setOpen: (open: boolean) => void }>;

export function LoadoutSection({ loadouts, clock, onApply, open, setOpen }: LoadoutSectionProps) {
  const shown = useTierLoadout(loadouts);
  const { active, overStock } = shown;

  useEffect(() => {
    if (!open) return;
    return clock.subscribe(() => {
      if (clock.state().kind === "running") setOpen(false);
    });
  }, [open, clock, setOpen]);

  return (
    <>
      <RuneScapeButton
        id="loadout"
        type="button"
        aria-expanded={open}
        onClick={() => {
          clock.pause();
          setOpen(!open);
        }}
      >
        Loadout
      </RuneScapeButton>
      {editCannotLoad(shown) && <small id="loadout_note">{`Your ${active.preset.label} edit can't load, so the run starts on the preset. Open Loadout to see why.`}</small>}
      {open && (
        <section id="loadout_editor" aria-label="Loadout editor">
          {overStock.length > 0 && (
            <p id="loadout_over_stock" role="status">
              {`Your ${active.preset.label} edit carries more than the supplies allow (${overStock.map(({ item, carried, allowed }) => `${item.name} ${carried} of ${allowed}`).join(", ")})`}
            </p>
          )}
          <LoadoutEditor sim={OCELLUS_LOADOUTS} store={loadouts} onApply={onApply} choices={editorChoices} />
          {NOT_STOCKED !== "" && <small id="shop_not_simulated">{`Not simulated yet, so not stocked: ${NOT_STOCKED}`}</small>}
          <RuneScapeButton id="loadout_close" type="button" onClick={() => setOpen(false)}>
            Close
          </RuneScapeButton>
        </section>
      )}
    </>
  );
}
