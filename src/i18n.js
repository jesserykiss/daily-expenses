import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES
} from "./constants.js";

const localeUrls = {
  "zh-CN": new URL("../locales/zh-CN.json", import.meta.url),
  "en-US": new URL("../locales/en-US.json", import.meta.url)
};

const localeCache = new Map();
const localeListeners = new Set();
const warnedMissingKeys = new Set();

let activeLocale = DEFAULT_LOCALE;
let activeMessages = Object.create(null);
let fallbackMessages = Object.create(null);

function normalizeSupportedLocale(language) {
  const normalized = String(language ?? "").toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }
  if (normalized.startsWith("en")) {
    return "en-US";
  }
  return null;
}

function readStoredLocale() {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLocale(locale) {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in restricted browsing modes.
  }
}

function detectLocale() {
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }

  const languages = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language];

  for (const language of languages) {
    const supported = normalizeSupportedLocale(language);
    if (supported) {
      return supported;
    }
  }

  return DEFAULT_LOCALE;
}

async function loadLocale(locale) {
  if (!localeCache.has(locale)) {
    localeCache.set(
      locale,
      fetch(localeUrls[locale], { cache: "no-cache" }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load locale ${locale}: ${response.status}`);
        }
        return response.json();
      })
    );
  }

  return localeCache.get(locale);
}

function interpolate(message, params) {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return Object.hasOwn(params ?? {}, key) ? String(params[key]) : match;
  });
}

export function t(key, params = {}) {
  let message = activeMessages[key];

  if (typeof message !== "string") {
    message = fallbackMessages[key];
    if (typeof message === "string" && activeLocale !== DEFAULT_LOCALE && !warnedMissingKeys.has(key)) {
      warnedMissingKeys.add(key);
      console.warn(`Missing ${activeLocale} translation for "${key}"; using ${DEFAULT_LOCALE}.`);
    }
  }

  if (typeof message !== "string") {
    if (!warnedMissingKeys.has(key)) {
      warnedMissingKeys.add(key);
      console.warn(`Missing translation key "${key}".`);
    }
    return key;
  }

  return interpolate(message, params);
}

export function getLocale() {
  return activeLocale;
}

export function getAlternateLocale() {
  return activeLocale === "zh-CN" ? "en-US" : "zh-CN";
}

export function applyDocumentTranslations(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    const key = element.getAttribute("data-i18n");
    if (key) {
      element.textContent = t(key);
    }
  }

  for (const element of root.querySelectorAll("[data-i18n-attr]")) {
    const definitions = element.getAttribute("data-i18n-attr") ?? "";
    for (const definition of definitions.split(",")) {
      const [attribute, key] = definition.split(":").map((part) => part.trim());
      if (attribute && key) {
        element.setAttribute(attribute, t(key));
      }
    }
  }
}

function notifyLocaleListeners() {
  for (const listener of localeListeners) {
    listener(activeLocale);
  }
}

export function subscribeLocale(listener) {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale) || locale === activeLocale) {
    return;
  }

  activeLocale = locale;
  activeMessages = localeCache.get(locale) ?? activeMessages;
  storeLocale(locale);
  document.documentElement.lang = locale;
  applyDocumentTranslations(document);
  notifyLocaleListeners();
}

export async function initI18n() {
  const [zhCN, enUS] = await Promise.all([
    loadLocale("zh-CN"),
    loadLocale("en-US")
  ]);

  localeCache.set("zh-CN", zhCN);
  localeCache.set("en-US", enUS);
  fallbackMessages = zhCN;
  activeLocale = detectLocale();
  activeMessages = localeCache.get(activeLocale);
  document.documentElement.lang = activeLocale;
  applyDocumentTranslations(document);
}
