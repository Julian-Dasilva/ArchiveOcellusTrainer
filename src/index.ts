import React from "react";
import { createRoot } from "react-dom/client";
import { ArchiveOcellusApp } from "./ArchiveOcellusApp";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(React.createElement(ArchiveOcellusApp));

export const plantedTypeError: number = "planted";
