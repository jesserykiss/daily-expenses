import { formatMonthKey } from "./format.js";
import { getLocale, t } from "./i18n.js";

export function el(tagName, properties = {}, children = []) {
  const element = document.createElement(tagName);
  const { className, text, attrs, dataset } = properties;

  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null && value !== false) {
        element.setAttribute(name, value === true ? "" : String(value));
      }
    }
  }
  if (dataset) {
    for (const [name, value] of Object.entries(dataset)) {
      element.dataset[name] = value;
    }
  }

  for (const child of children) {
    if (child !== null && child !== undefined) {
      element.append(child);
    }
  }

  return element;
}

export function createPageHeading(titleKey, bodyKey) {
  const heading = el("h1", {
    className: "page-heading",
    text: t(titleKey),
    attrs: { tabindex: "-1" }
  });
  const intro = el("p", {
    className: "page-intro",
    text: bodyKey ? t(bodyKey) : ""
  });

  return { heading, intro };
}

export function createStatusRow(labelText, valueText, tone = "ok") {
  const dot = el("span", {
    className: `status-dot status-dot--${tone}`,
    attrs: { "aria-hidden": "true" }
  });

  return el("div", { className: "status-row" }, [
    el("span", { className: "status-row__label", text: labelText }),
    el("span", { className: "status-row__value" }, [dot, document.createTextNode(valueText)])
  ]);
}

export function createEmptyState(title, body, action = null) {
  return el("div", { className: "surface" }, [
    el("h2", { text: title, attrs: { style: "margin: 0 0 8px; font-size: 1.08rem;" } }),
    el("p", { className: "page-intro", text: body }),
    action
  ]);
}

let toastTimer = null;

export function showToast(message, { type = "info", duration = 3200 } = {}) {
  const region = document.getElementById("toast-region");
  if (!region) {
    return;
  }

  globalThis.clearTimeout(toastTimer);
  region.replaceChildren(
    el("div", {
      className: `toast${type === "error" ? " toast--error" : ""}`,
      text: message,
      attrs: { role: type === "error" ? "alert" : "status" }
    })
  );

  toastTimer = globalThis.setTimeout(() => {
    region.replaceChildren();
  }, duration);
}

export function showDialog({
  title,
  message,
  confirmLabel = t("common.confirm"),
  cancelLabel = t("common.cancel"),
  tone = "primary"
}) {
  const dialog = document.getElementById("app-dialog");
  const titleElement = document.getElementById("app-dialog-title");
  const messageElement = document.getElementById("app-dialog-message");
  const confirmButton = document.getElementById("app-dialog-confirm");
  const cancelButton = document.getElementById("app-dialog-cancel");

  if (!dialog || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  }

  if (dialog.open) {
    dialog.close("cancel");
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmLabel;
  confirmButton.className = `button button--${tone === "danger" ? "danger" : "primary"}`;
  cancelButton.textContent = cancelLabel;
  cancelButton.hidden = !cancelLabel;

  return new Promise((resolve) => {
    const handleClose = () => {
      resolve(dialog.returnValue === "confirm");
    };

    dialog.addEventListener("close", handleClose, { once: true });
    dialog.showModal();
    cancelButton.focus();
  });
}

export function createMonthPicker({ value, months, onChange }) {
  const label = el("label", {
    text: t("monthPicker.label"),
    attrs: { for: "month-picker-select" }
  });
  const select = el("select", {
    attrs: {
      id: "month-picker-select",
      "aria-label": t("monthPicker.selectAria")
    }
  });
  const wrapper = el("div", { className: "field" }, [label, select]);

  function render(nextValue = value, nextMonths = months) {
    value = nextValue;
    months = nextMonths;
    label.textContent = t("monthPicker.label");
    select.setAttribute("aria-label", t("monthPicker.selectAria"));
    select.replaceChildren(
      ...months.map((monthKey) =>
        el("option", {
          text: formatMonthKey(monthKey, getLocale()),
          attrs: { value: monthKey }
        })
      )
    );
    select.value = value;
  }

  select.addEventListener("change", () => {
    value = select.value;
    onChange?.(value);
  });

  render();

  return {
    element: wrapper,
    getValue: () => select.value,
    update: render,
    refreshLocale: () => render(select.value, months),
    select
  };
}
