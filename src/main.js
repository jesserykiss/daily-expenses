import { APP_VERSION, STORAGE_NOTICE_SESSION_KEY } from "./constants.js";
import { openDatabase } from "./db.js";
import {
  applyDocumentTranslations,
  getAlternateLocale,
  getLocale,
  initI18n,
  setLocale,
  subscribeLocale,
  t
} from "./i18n.js";
import { createRouter } from "./router.js";
import { el, showToast } from "./ui.js";

const routes = [
  {
    name: "add",
    pattern: /^#\/add\/?$/,
    paramNames: [],
    load: () => import("./pages/add.js")
  },
  {
    name: "records",
    pattern: /^#\/records\/?$/,
    paramNames: [],
    load: () => import("./pages/records.js")
  },
  {
    name: "stats",
    pattern: /^#\/stats\/?$/,
    paramNames: [],
    load: () => import("./pages/stats.js")
  },
  {
    name: "settings",
    pattern: /^#\/settings\/?$/,
    paramNames: [],
    load: () => import("./pages/settings.js")
  },
  {
    name: "edit",
    pattern: /^#\/edit\/(\d+)\/?$/,
    paramNames: ["id"],
    load: () => import("./pages/add.js")
  }
];

const appContext = {
  storageState: {
    supported: false,
    persistent: false
  },
  recordsView: null,
  statsView: null,
  version: APP_VERSION
};

let router = null;
let unsubscribeLocale = null;

function updateLanguageButton() {
  const button = document.getElementById("language-toggle");
  const label = document.getElementById("language-toggle-label");
  if (!button || !label) {
    return;
  }

  const currentLocale = getLocale();
  label.textContent = currentLocale === "zh-CN" ? "中文" : "EN";
  button.setAttribute("aria-label", `${t("settings.languageTitle")}: ${label.textContent}`);
  button.title = t("settings.languageTitle");
}

function setupLanguageToggle() {
  const button = document.getElementById("language-toggle");
  button?.addEventListener("click", () => {
    setLocale(getAlternateLocale());
  });
}

async function requestStoragePersistence() {
  if (!globalThis.navigator?.storage?.persisted) {
    return { supported: false, persistent: false };
  }

  try {
    let persistent = await globalThis.navigator.storage.persisted();
    if (!persistent && typeof globalThis.navigator.storage.persist === "function") {
      persistent = await globalThis.navigator.storage.persist();
    }
    return { supported: true, persistent };
  } catch {
    return { supported: false, persistent: false };
  }
}

function storageNoticeWasDismissed() {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_NOTICE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissStorageNotice() {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_NOTICE_SESSION_KEY, "1");
  } catch {
    // A non-persistent dismissal is still preferable to blocking the app.
  }
}

function setupStorageBanner() {
  const banner = document.getElementById("storage-banner");
  const dismiss = document.getElementById("storage-banner-dismiss");
  if (!banner || !dismiss) {
    return;
  }

  dismiss.addEventListener("click", () => {
    dismissStorageNotice();
    banner.hidden = true;
  });

  const shouldWarn =
    (!appContext.storageState.supported || !appContext.storageState.persistent) &&
    !storageNoticeWasDismissed();
  banner.hidden = !shouldWarn;
}

function renderFatalError({ titleKey, messageKey, error }) {
  const main = document.getElementById("app-main");
  const tabbar = document.querySelector(".tabbar");
  const banner = document.getElementById("storage-banner");

  if (banner) {
    banner.hidden = true;
  }
  if (tabbar) {
    tabbar.hidden = true;
  }
  if (!main) {
    return;
  }

  const retry = el("button", {
    className: "button button--primary",
    text: t("common.retry"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => globalThis.location.reload());

  main.replaceChildren(
    el("section", { className: "fatal-state", attrs: { role: "alert" } }, [
      el("h1", { text: t(titleKey) }),
      el("p", { text: t(messageKey) }),
      retry
    ])
  );

  if (error) {
    console.error(error);
  }
}

function handleDatabaseError(error) {
  if (error?.name === "VersionError") {
    renderFatalError({
      titleKey: "app.dbVersionTitle",
      messageKey: "app.dbVersionBody",
      error
    });
    return;
  }

  renderFatalError({
    titleKey: "app.storageUnavailableTitle",
    messageKey: "app.storageUnavailableBody",
    error
  });
}

async function bootstrap() {
  try {
    await initI18n();
    setupLanguageToggle();
    updateLanguageButton();

    appContext.storageState = await requestStoragePersistence();

    try {
      await openDatabase();
    } catch (error) {
      handleDatabaseError(error);
      return;
    }

    setupStorageBanner();

    router = createRouter({
      outlet: document.getElementById("app-main"),
      routes,
      context: appContext,
      onError: () => showToast(t("error.unexpected"), { type: "error" })
    });

    unsubscribeLocale = subscribeLocale(() => {
      applyDocumentTranslations(document);
      updateLanguageButton();
      router.refreshLocale();
    });

    await router.start();
  } catch (error) {
    console.error(error);
    document.getElementById("app-main")?.replaceChildren(
      el("section", { className: "fatal-state", attrs: { role: "alert" } }, [
        el("h1", { text: "无法启动应用 / Unable to start the app" }),
        el("p", { text: "请通过 HTTP 静态服务器打开应用。 Serve the app over HTTP." })
      ])
    );
  }
}

globalThis.addEventListener("error", (event) => {
  if (event.error) {
    console.error(event.error);
  }
});

globalThis.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  if (getLocale()) {
    showToast(t("error.unexpected"), { type: "error" });
  }
});

globalThis.addEventListener("beforeunload", () => {
  unsubscribeLocale?.();
  router?.destroy();
});

bootstrap();
