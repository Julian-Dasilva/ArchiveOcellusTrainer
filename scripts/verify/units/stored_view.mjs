export const captures = () => ["viewport-renders.js", "stored-view-before.json", "stored-view.png", "stored-view.json", "stored-view-page-errors.json"];

export function judge({ read }) {
  const [before, after, errors] = ["stored-view-before.json", "stored-view.json", "stored-view-page-errors.json"].map(read);
  const checks = {
    stored2dViewOpensIn3d: before.use3dView === false && after.tick >= 8 && after.viewportRenders > 0 && after.saved.use3dView === true && after.saved.rotated === "north",
    noStoredViewPageErrors: errors.length === 0,
  };
  return { observed: { before, after }, checks };
}
