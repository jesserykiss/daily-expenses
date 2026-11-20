import { t } from "./i18n.js";

function findRoute(routes, hash) {
  for (const route of routes) {
    const match = route.pattern.exec(hash);
    if (match) {
      const params = {};
      for (const [index, name] of (route.paramNames ?? []).entries()) {
        params[name] = match[index + 1];
      }
      return { definition: route, params };
    }
  }

  return null;
}

export function createRouter({ outlet, routes, context, onError }) {
  let currentPage = null;
  let currentHash = "";
  let currentRoute = null;
  let sequence = 0;
  let started = false;

  function updateNavigation(routeName) {
    for (const item of document.querySelectorAll("[data-route]")) {
      if (item.dataset.route === routeName) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    }
    document.body.dataset.page = routeName;
  }

  function focusPage() {
    const heading = outlet.querySelector("h1");
    if (heading) {
      heading.focus({ preventScroll: true });
    } else {
      outlet.focus({ preventScroll: true });
    }
  }

  async function renderCurrentRoute() {
    const requestedSequence = ++sequence;
    const requestedHash = globalThis.location.hash || "#/add";
    const matched = findRoute(routes, requestedHash);

    if (!matched) {
      if (requestedHash !== "#/add") {
        globalThis.history.replaceState(null, "", "#/add");
      }
      return renderCurrentRoute();
    }

    if (currentHash === requestedHash && currentPage) {
      return;
    }

    if (currentPage?.canLeave) {
      const canLeave = await currentPage.canLeave();
      if (!canLeave) {
        globalThis.history.replaceState(null, "", currentHash || "#/add");
        return;
      }
    }

    try {
      const module = await matched.definition.load();
      if (requestedSequence !== sequence) {
        return;
      }

      const page = module.createPage({
        route: {
          name: matched.definition.name,
          params: matched.params
        },
        context,
        navigate
      });

      currentPage?.destroy?.();
      outlet.replaceChildren();
      currentPage = page;
      currentHash = requestedHash;
      currentRoute = matched.definition;
      await page.mount(outlet);
      updateNavigation(matched.definition.name);
      focusPage();
    } catch (error) {
      console.error(error);
      if (onError) {
        onError(error);
      } else {
        outlet.replaceChildren(
          Object.assign(document.createElement("p"), {
            textContent: t("error.unexpected")
          })
        );
      }
    }
  }

  function navigate(path, { replace = false } = {}) {
    const hash = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
    if (globalThis.location.hash === hash) {
      renderCurrentRoute();
      return;
    }

    if (replace) {
      globalThis.history.replaceState(null, "", hash);
      renderCurrentRoute();
    } else {
      globalThis.location.hash = hash;
    }
  }

  async function start() {
    if (started) {
      return;
    }
    started = true;

    if (!globalThis.location.hash) {
      globalThis.history.replaceState(null, "", "#/add");
    }

    globalThis.addEventListener("hashchange", renderCurrentRoute);
    await renderCurrentRoute();
  }

  function refreshLocale() {
    currentPage?.refreshLocale?.();
    if (currentRoute) {
      updateNavigation(currentRoute.name);
    }
  }

  function destroy() {
    if (started) {
      globalThis.removeEventListener("hashchange", renderCurrentRoute);
    }
    currentPage?.destroy?.();
    currentPage = null;
  }

  return {
    start,
    navigate,
    refreshLocale,
    destroy,
    getCurrentRoute: () => currentRoute
  };
}
