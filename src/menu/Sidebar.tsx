import React from "react";
import type { ReactNode } from "react";
import { Settings } from "osrs-sdk";
import type { SettingsState } from "osrs-sdk";
import { DefaultSidebar, RuneScapeButton, useSettingsSnapshot } from "osrs-sdk-react";
import { CONTRIBUTOR, MAKER, MAKER_LINKS } from "./credits";

type TileIndicator = "targetTileEnabled" | "trueTileEnabled" | "hoveredTileEnabled" | "entityIndicatorEnabled";

const TILE_INDICATORS: readonly Readonly<{ id: string; setting: TileIndicator; label: string }>[] = [
  { id: "destination_tile", setting: "targetTileEnabled", label: "Destination tile (where you clicked)" },
  { id: "true_tile", setting: "trueTileEnabled", label: "True tile (where the server has you)" },
  { id: "hovered_tile", setting: "hoveredTileEnabled", label: "Hovered tile" },
  { id: "entity_outlines", setting: "entityIndicatorEnabled", label: "Player and NPC outlines" },
];

function setTileIndicator(setting: TileIndicator, on: boolean) {
  const patch: Partial<Pick<SettingsState, TileIndicator>> = {};
  patch[setting] = on;
  Settings.set(patch);
}

function TileIndicators() {
  const settings = useSettingsSnapshot();
  return (
    <section id="tile_indicators">
      <div className="sidebar_title">Tile indicators</div>
      {TILE_INDICATORS.map(({ id, setting, label }) => (
        <label key={id}>
          <input id={id} type="checkbox" checked={settings[setting]} onChange={(event) => setTileIndicator(setting, event.target.checked)} />
          {label}
        </label>
      ))}
    </section>
  );
}

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

function Credits() {
  return (
    <section id="sidebar_credits">
      <div className="sidebar_title">Credits</div>
      <ul>
        <li id="sidebar_maker">
          Made by {MAKER}:{" "}
          {MAKER_LINKS.map((link, i) => (
            <React.Fragment key={link.href}>
              {i > 0 && " · "}
              <a href={link.href} {...external}>{link.label}</a>
            </React.Fragment>
          ))}
        </li>
        <li id="sidebar_contributor">
          With help from <a href={CONTRIBUTOR.href} {...external}>{CONTRIBUTOR.label}</a>
        </li>
      </ul>
    </section>
  );
}

// The drill's controls keep their popup markup and ids, so the sidebar restyles them in place.
const SIDEBAR_CSS = `
#sidebar { display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: #ff981f; }
#sidebar hr { width: 100%; margin: 0; }
#sidebar h3 { margin: 2px 0 0; font-weight: normal; font-size: 24px; text-align: center; }
#sidebar .sidebar_subtitle { margin-bottom: 4px; text-align: center; font-size: 13px; color: #c8b88a; }
#sidebar .sidebar_title { color: #ff981f; }
#sidebar label { display: flex; flex-direction: column; gap: 3px; color: #ffcf8a; }
#sidebar label:has(> input[type="checkbox"]) { flex-direction: row; align-items: center; justify-content: space-between; gap: 6px; }
#sidebar #tile_indicators label { justify-content: flex-start; }
#sidebar select, #sidebar #seed { font: inherit; width: 100%; box-sizing: border-box; padding: 2px; border: 1px solid #6b5b3e; background: #2b2418; color: #fff; }
#sidebar #drill_controls { flex-direction: column; font-size: inherit; }
#sidebar #settings_menu, #sidebar #settings_menu[hidden] { position: static; display: grid; justify-items: stretch; max-height: none; padding: 0; border: 0; outline: 0; background: none; white-space: normal; }
#sidebar #whats_new_panel { position: static; width: auto; max-height: none; }
#sidebar #settings { display: none; }
#sidebar #drill_controls button { width: 100%; }
#sidebar ul { margin: 4px 0 0; padding-left: 16px; color: #e8dcc0; font-size: 13px; line-height: 15px; }
#sidebar li { margin-bottom: 5px; }
#sidebar a { color: #ff981f; }
`;

export default function Sidebar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <DefaultSidebar>
      <style>{SIDEBAR_CSS}</style>
      <div id="sidebar">
        <h3>Ocellus</h3>
        <div className="sidebar_subtitle">The Fractured Archive</div>
        <RuneScapeButton id="full_fight" type="button" style={{ width: "100%" }} onClick={() => window.location.assign(new URL("?mode=full", window.location.href).href)}>
          Full fight (beta)
        </RuneScapeButton>
        <hr />
        {children}
        <hr />
        <TileIndicators />
        <hr />
        <Credits />
      </div>
    </DefaultSidebar>
  );
}
