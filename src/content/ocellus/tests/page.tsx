import React, { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveOcellusApp } from "../../../ArchiveOcellusApp";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export const loadPage = (url: string) => mountPage(url, <ArchiveOcellusApp />);

/** A test that must also run on a base whose app is another page mounts the page it tests. */
export function mountPage(url: string, page: ReactElement) {
  window.history.replaceState(null, "", url);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(page));
  const element = (id: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(`#${id}`);
    if (!found) throw new Error(`the page has no #${id}`);
    return found;
  };
  const input = (id: string): HTMLInputElement => {
    const found = container.querySelector<HTMLInputElement>(`input#${id}`);
    if (!found) throw new Error(`the page has no input #${id}`);
    return found;
  };
  return {
    click: (id: string) => act(() => element(id).click()),
    press: (key: string, target: EventTarget = document) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))),
    type: (id: string, text: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input(id), text);
        input(id).dispatchEvent(new Event("input", { bubbles: true }));
      }),
    value: (id: string) => input(id).value,
    checked: (id: string) => input(id).checked,
    element,
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function captureNavigation() {
  const real = window.location;
  const assigned: string[] = [];
  Object.defineProperty(window, "location", { configurable: true, value: { get href() { return real.href; }, assign: (url: string) => void assigned.push(url) } });
  return { assigned, restore: () => Object.defineProperty(window, "location", { configurable: true, value: real }) };
}
