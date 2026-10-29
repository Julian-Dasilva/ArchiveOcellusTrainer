import { position } from "../sections";

export function ready(): boolean {
  return position("Display") === 1;
}
