import React from "react";
import type { ReactNode } from "react";
import { ControlPanelController, Settings, SoundCache } from "osrs-sdk";
import type { SettingsState } from "osrs-sdk";
import { DefaultSidebar, RuneScapeButton, useSettingsSnapshot } from "osrs-sdk-react";
import { CONTRIBUTOR, MAKER, MAKER_LINKS } from "./credits";

type SettingToggle = "targetTileEnabled" | "trueTileEnabled" | "hoveredTileEnabled" | "entityIndicatorEnabled" | "playsAudio" | "playsAreaAudio";

type Toggle = Readonly<{ id: string; setting: SettingToggle; label: string; hint: string | null }>;

const TILE_INDICATORS: readonly Toggle[] = [
  { id: "destination_tile", setting: "targetTileEnabled", label: "Destination tile", hint: "Where you clicked" },
  { id: "true_tile", setting: "trueTileEnabled", label: "True tile", hint: "Where the server has you" },
  { id: "hovered_tile", setting: "hoveredTileEnabled", label: "Hovered tile", hint: null },
  { id: "entity_outlines", setting: "entityIndicatorEnabled", label: "Outlines", hint: "Players and NPCs" },
];

const SOUNDS: readonly Toggle[] = [
  { id: "sound", setting: "playsAudio", label: "Sound effects", hint: null },
  { id: "area_sound", setting: "playsAreaAudio", label: "Area sounds", hint: null },
];

function setToggle(setting: SettingToggle, on: boolean) {
  const patch: Partial<Pick<SettingsState, SettingToggle>> = {};
  patch[setting] = on;
  Settings.set(patch);
  void SoundCache.context?.resume();
}

function SettingToggles({ toggles }: Readonly<{ toggles: readonly Toggle[] }>) {
  const settings = useSettingsSnapshot();
  return toggles.map(({ id, setting, label, hint }) => (
    <label key={id}>
      {label}
      {hint !== null && <small>{hint}</small>}
      <input id={id} type="checkbox" checked={settings[setting]} onChange={(event) => setToggle(setting, event.target.checked)} />
    </label>
  ));
}

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

type SidebarHome = "full-fight" | "phase-4-drill";

function HomeButton({ home }: Readonly<{ home: SidebarHome }>) {
  switch (home) {
    case "full-fight":
      return (
        <RuneScapeButton id="full_fight" type="button" onClick={() => window.location.assign(new URL("?mode=full", window.location.href).href)}>
          Full fight (beta)
        </RuneScapeButton>
      );
    case "phase-4-drill":
      return (
        <RuneScapeButton id="phase_4_drill" type="button" onClick={() => window.location.assign(window.location.pathname)}>
          Phase 4 drill
        </RuneScapeButton>
      );
    default: {
      const unhandled: never = home;
      return unhandled;
    }
  }
}

function Credits() {
  return (
    <ul id="sidebar_credits">
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
  );
}

function Section({ id, title, children }: Readonly<{ id: string; title: string; children: ReactNode }>) {
  return (
    <section id={id}>
      <h4 className="sidebar_title">{title}</h4>
      {children}
    </section>
  );
}

// #right_panel is the SDK's only scroll container; nothing inside may scroll, or its scrollbar narrows the panel and clips the rows.
// The drill's What's new panel keeps its popup id, so the sidebar resets that popup styling in place.
const SIDEBAR_CSS = `
#right_panel { overflow-x: hidden; }
#sidebar { display: flex; flex-direction: column; gap: 10px; min-width: 0; font-size: 14px; color: #ff981f; overflow-wrap: anywhere; }
#sidebar h3 { margin: 2px 0 0; font-weight: normal; font-size: 24px; text-align: center; }
#sidebar .sidebar_subtitle { margin-top: -8px; text-align: center; font-size: 13px; color: #c8b88a; }
#sidebar > section { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid #6b5b3e; }
#sidebar .sidebar_title { margin: 0; font-weight: normal; font-size: 15px; color: #ff981f; }
#sidebar > section > form, #sidebar > section > div { display: contents; }
#sidebar label { display: flex; flex-direction: column; gap: 3px; color: #ffcf8a; }
#sidebar label:has(> input[type="checkbox"]) { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; align-items: center; }
#sidebar label > input[type="checkbox"] { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
#sidebar label > small { grid-column: 1; font-size: 12px; color: #a89a78; }
#sidebar select, #sidebar #seed { font: inherit; width: 100%; box-sizing: border-box; padding: 2px; border: 1px solid #6b5b3e; background: #2b2418; color: #fff; }
#sidebar button { width: 100%; }
#sidebar #whats_new_panel { position: static; box-sizing: border-box; width: auto; max-height: none; overflow: visible; }
#sidebar ul { margin: 0; padding-left: 16px; color: #e8dcc0; font-size: 13px; line-height: 15px; }
#sidebar li { margin-bottom: 5px; }
#sidebar a { color: #ff981f; }
`;

export type SidebarSlots = Readonly<{ home: SidebarHome; fight: ReactNode; aids: ReactNode; about: ReactNode; after: ReactNode }>;

export default function Sidebar({ home, fight, aids, about, after }: SidebarSlots) {
  return (
    <DefaultSidebar>
      <style>{SIDEBAR_CSS}</style>
      <div id="sidebar">
        <h3>Ocellus</h3>
        <div className="sidebar_subtitle">The Fractured Archive</div>
        <HomeButton home={home} />
        <Section id="sidebar_fight" title="Fight">{fight}</Section>
        <Section id="learning_aids" title="Learning aids">
          {aids}
          <SettingToggles toggles={TILE_INDICATORS} />
        </Section>
        <Section id="sidebar_sound" title="Sound">
          <SettingToggles toggles={SOUNDS} />
        </Section>
        <Section id="sidebar_controls" title="Controls">
          <RuneScapeButton id="keybinds" type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Keybinds</RuneScapeButton>
        </Section>
        <Section id="sidebar_about" title="About">
          {about}
          <Credits />
        </Section>
        {after}
      </div>
    </DefaultSidebar>
  );
}
