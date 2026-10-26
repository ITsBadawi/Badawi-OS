import english from "../locales/english.ts";
import { formatText, registerEnglish, translate } from "../localization.ts";
import type { Store } from "./store.ts";
registerEnglish(english);
// Resolve the owning profile on every call; the renderer's language is unrelated.
const language = (store?: Pick<Store, "setting">) =>
  store?.setting("language") === "en" ? ("en" as const) : ("ar" as const);
export const hostText = (
  store: Pick<Store, "setting"> | undefined,
  source: string,
) => translate(source, language(store));
export const hostFormat = (
  store: Pick<Store, "setting"> | undefined,
  source: string,
  values: unknown[],
) => formatText(source, values, language(store));
