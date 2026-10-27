import React, { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { ControlPanelController, Settings, SoundCache } from "osrs-sdk";
import type { SettingsState } from "osrs-sdk";
import { DefaultSidebar, RuneScapeButton, useSettingsSnapshot } from "osrs-sdk-react";
import { CHANGELOG } from "../content/ocellus/changelog";
import { CONTRIBUTOR, CREDIT_LINE, MAKER, MAKER_LINKS } from "./credits";

const [LATEST_RELEASE] = CHANGELOG;

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

function phoneLayout(): boolean {
  const mobile: unknown = Settings.mobileCheck();
  return mobile === true;
}

function PhoneMenuButton() {
  const { menuVisible } = useSettingsSnapshot();
  if (!phoneLayout()) return null;
  return (
    <button id="phone_menu" type="button" aria-expanded={menuVisible} onClick={() => Settings.setMenuVisible(!menuVisible)}>
      {menuVisible ? "Close" : "Menu"}
    </button>
  );
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

function openKeybinds() {
  ControlPanelController.controller.setActiveControl("SETTINGS");
  if (phoneLayout()) Settings.setMenuVisible(false);
}

function PolicyFooter({ menu }: Readonly<{ menu: ReactNode }>) {
  return (
    <footer id="policy_footer">
      <Credits />
      <p id="credit_line">{CREDIT_LINE}</p>
      <p id="app_version">v{LATEST_RELEASE.version}</p>
      {menu}
    </footer>
  );
}

export function FightLoadNotice({ failed }: Readonly<{ failed: boolean }>) {
  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      {failed && (
        <main id="fight_load_error">
          <p>The full fight didn't load.</p>
          <button id="fight_reload" type="button" onClick={() => window.location.reload()}>Reload</button>
          <a id="fight_back_to_drill" href={window.location.pathname}>Back to the drill</a>
        </main>
      )}
      <PolicyFooter menu={null} />
    </>
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
// The SDK draws its tabs and inventory on the canvas, so the policy strip takes a grid row under the canvas and the panel. TrainerApp sets display inline and DefaultSidebar sets the panel width inline, hence !important.
const SIDEBAR_CSS = `
div:has(> #right_panel) { display: grid !important; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: minmax(0, 1fr) auto; }
#policy_footer { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 8px; padding: 3px 6px; background: #1b160f; border-top: 1px solid #3e3529; color: #c8b88a; font-size: 11px; }
#policy_footer #sidebar_credits { flex: 1 1 100%; margin: 0; padding-left: 16px; color: #e8dcc0; font-size: 13px; line-height: 15px; }
#policy_footer #sidebar_credits a { color: #ff981f; }
#policy_footer #credit_line { flex: 1 1 0; max-width: none; margin: 0; }
#policy_footer #app_version { margin: 0; white-space: nowrap; opacity: 0.8; }
#policy_footer #phone_menu { flex: 0 0 auto; margin: 0 0 0 auto; padding: 2px 8px; border: 1px solid #6b5b3e; background: #2b2418; color: #ff981f; font: inherit; }
html.phone-overlay div:has(> #right_panel) { grid-template-columns: minmax(0, 1fr); }
/* #trainer-loading is z-index 1000 and takes hits. The open panel has to paint above it, and the footer above the panel. */
html.phone-overlay #right_panel { position: fixed; top: 0; right: 0; width: min(280px, 92vw) !important; height: auto !important; max-height: 100%; z-index: 1001; }
html.phone-overlay #policy_footer { position: relative; z-index: 1002; }
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
#fight_load_error { padding: 24px 16px; color: #ff981f; }
#fight_load_error p { margin: 0 0 12px; }
#fight_load_error button, #fight_load_error a { display: inline-flex; align-items: center; box-sizing: border-box; min-height: 24px; margin: 0; padding: 0 8px; border: 0; background: transparent; color: #ff981f; font: inherit; line-height: 24px; text-decoration: none; }
#fight_load_error a { margin-left: 12px; }
`;

export type SidebarSlots = Readonly<{ home: SidebarHome; fight: ReactNode; aids: ReactNode; about: ReactNode; after: ReactNode }>;

export default function Sidebar({ home, fight, aids, about, after }: SidebarSlots) {
  useLayoutEffect(() => {
    if (!phoneLayout()) return;
    const root = document.documentElement;
    const footer = document.getElementById("policy_footer");
    const panel = document.getElementById("right_panel");
    root.classList.add("phone-overlay");
    // The footer paints above this overlay, so the panel ends at the footer's top.
    const fit = () => {
      if (!(footer instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
      panel.style.bottom = `${footer.offsetHeight}px`;
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" || !(footer instanceof HTMLElement) ? null : new ResizeObserver(fit);
    if (observer !== null && footer instanceof HTMLElement) observer.observe(footer);
    return () => {
      observer?.disconnect();
      if (panel instanceof HTMLElement) panel.style.bottom = "";
      root.classList.remove("phone-overlay");
    };
  }, []);
  return (
    <>
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
            <RuneScapeButton id="keybinds" type="button" onClick={openKeybinds}>Keybinds</RuneScapeButton>
          </Section>
          <Section id="sidebar_about" title="About">
            {about}
          </Section>
          {after}
        </div>
      </DefaultSidebar>
      <PolicyFooter menu={<PhoneMenuButton />} />
    </>
  );
}
