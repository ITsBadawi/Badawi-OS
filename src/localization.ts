export type Language = "ar" | "en";
let language: Language = "ar";
let english: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
const missing = new Set<string>();
const proxies = new WeakMap<object, object>();
export function registerEnglish(dictionary: Record<string, string>) {
  english = dictionary;
}
export async function prepareLanguage(next: Language) {
  if (next === "en" && !english) {
    loading ||= import("./locales/english.ts").then((module) => {
      registerEnglish(module.default);
    });
    await loading;
  }
}
export function setUiLanguage(next: Language) {
  language = next;
}
export function uiLanguage() {
  return language;
}
export function localeTag(next: Language = language) {
  return next === "en" ? "en-GB" : "ar-IQ";
}
export function translate(source: string, next: Language = language) {
  if (next === "ar") return source;
  const key = source.trim(),
    translated = english?.[key];
  if (translated === undefined) {
    if (/[\u0600-\u06ff]/.test(key)) missing.add(key);
    return source;
  }
  return (
    source.slice(0, source.indexOf(key)) +
    translated +
    source.slice(source.indexOf(key) + key.length)
  );
}
export const uiText = (source: string) => translate(source);
export function formatText(
  source: string,
  values: unknown[],
  next: Language = language,
) {
  return translate(source, next).replace(/\{(\d+)\}/g, (match, index) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}
export const uiFormat = (source: string, values: unknown[]) =>
  formatText(source, values);
export function missingEnglishKeys() {
  return [...missing];
}
/** Static label maps stay reactive to language changes; never wrap owner data. */
export function uiLabels<T>(value: T): T {
  if (typeof value === "string") return uiText(value) as T;
  if (!value || typeof value !== "object" || "$$typeof" in value) return value;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  const known = proxies.get(value);
  if (known) return known as T;
  const proxy = new Proxy(value, {
    get(target, key, receiver) {
      return uiLabels(Reflect.get(target, key, receiver));
    },
  });
  proxies.set(value, proxy);
  return proxy;
}
