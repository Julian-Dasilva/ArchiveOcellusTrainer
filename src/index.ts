import React from "react";
import { createRoot } from "react-dom/client";
import { ArchiveOcellusApp } from "./ArchiveOcellusApp";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The full fight loads behind a test of the raw build variable, which webpack folds, so a build with it off contains none of its modules.
if (process.env.ARCHIVE_FULL === "on" && new URL(window.location.href).searchParams.get("mode") === "full") {
  void import("./FullFightApp").then(({ FullFightApp }) => createRoot(root).render(React.createElement(FullFightApp)));
} else {
  createRoot(root).render(React.createElement(ArchiveOcellusApp));
}
