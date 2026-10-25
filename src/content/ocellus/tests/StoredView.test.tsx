import { Settings } from "osrs-sdk";
import { loadPage } from "./page";

const SAVED_SETTINGS = "osrs-sdk:settings";

function savedView() {
  const { values } = JSON.parse(localStorage.getItem(SAVED_SETTINGS) ?? "null");
  return { use3dView: values.use3dView, rotated: values.rotated };
}

describe("Stored view", () => {
  beforeEach(() => localStorage.clear());

  test.each([
    { name: "the saved settings", store: () => localStorage.setItem(SAVED_SETTINGS, JSON.stringify({ version: 1, values: { use3dView: false, rotated: "south" } })) },
    {
      name: "the legacy keys",
      store: () => {
        localStorage.setItem("use3dView", "false");
        localStorage.setItem("rotated", "south");
      },
    },
  ])("a 2D view stored in $name loads as 3D and is saved as 3D facing north", ({ store }) => {
    store();
    const page = loadPage("/?seed=1");
    const loaded = Settings.use3dView;
    page.close();
    expect({ loaded, saved: savedView() }).toEqual({ loaded: true, saved: { use3dView: true, rotated: "north" } });
  });
});
