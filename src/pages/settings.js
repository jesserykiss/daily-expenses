import { DB_VERSION, MAX_IMPORT_BYTES } from "../constants.js";
import {
  clearAllExpenses,
  createExportFilename,
  DataTransferError,
  exportAllExpenses,
  importExpenseData,
  parseImportText,
  saveExportFile,
  serializeExport
} from "../data-transfer.js";
import { getExpenseCount } from "../expenses.js";
import { getLocale, setLocale, t } from "../i18n.js";
import {
  createPageHeading,
  createStatusRow,
  el,
  showDialog,
  showToast
} from "../ui.js";

function createLanguageChoice(locale, label, currentLocale, disabled) {
  const input = el("input", {
    attrs: {
      type: "radio",
      name: "language",
      value: locale,
      checked: locale === currentLocale,
      disabled
    }
  });
  input.addEventListener("change", () => {
    if (input.checked) {
      setLocale(locale);
    }
  });

  return el("label", { className: "choice-chip" }, [input, document.createTextNode(label)]);
}

function createActionIcon(path) {
  const icon = el("svg", {
    attrs: {
      viewBox: "0 0 24 24",
      width: "20",
      height: "20",
      "aria-hidden": "true"
    }
  });
  icon.append(el("path", { attrs: { d: path } }));
  return icon;
}

function createActionButton({ className, label, iconPath, type = "button" }) {
  const text = el("span", { className: "settings-action__label", text: label });
  const button = el("button", {
    className,
    attrs: { type }
  }, [createActionIcon(iconPath), text]);
  return { button, text };
}

export function createPage({ context }) {
  let root = null;
  let count = 0;
  let busyOperation = null;
  let refs = null;

  function storageLabel(state) {
    if (!state?.supported) {
      return t("settings.storageUnsupported");
    }
    return state.persistent ? t("settings.storagePersistent") : t("settings.storageBestEffort");
  }

  function showTransferError(error, fallbackKey) {
    console.error(error);
    const message =
      error instanceof DataTransferError
        ? t(error.code, error.params)
        : t(fallbackKey);
    showToast(message, { type: "error" });
  }

  function syncBusyState() {
    if (!refs) {
      return;
    }
    const busy = Boolean(busyOperation);
    root?.setAttribute("aria-busy", String(busy));
    refs.exportButton.disabled = busy;
    refs.importButton.disabled = busy;
    refs.clearButton.disabled = busy;
    refs.fileInput.disabled = busy;
    refs.exportLabel.textContent =
      busyOperation === "export" ? t("settings.exporting") : t("settings.export");
    refs.importLabel.textContent =
      busyOperation === "import" ? t("settings.importing") : t("settings.import");
    refs.clearLabel.textContent = t("settings.clearData");
    for (const input of refs.languageInputs) {
      input.disabled = busy;
    }
  }

  function setBusy(operation) {
    busyOperation = operation;
    syncBusyState();
  }

  function refreshAfterMutation() {
    count = 0;
    context.recordsView = null;
    context.statsView = null;
    render();
    void getExpenseCount()
      .then((nextCount) => {
        count = nextCount;
        refs?.countValue && (refs.countValue.textContent = t("settings.recordTotal", { count }));
        refs?.recordValue && (refs.recordValue.textContent = t("settings.recordTotal", { count }));
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async function handleExport() {
    if (busyOperation) {
      return;
    }
    setBusy("export");
    try {
      const envelope = await exportAllExpenses();
      const result = await saveExportFile({
        text: serializeExport(envelope),
        filename: createExportFilename(),
        title: t("common.appName")
      });
      if (result !== "cancelled") {
        showToast(t("settings.exportSuccess"));
      }
    } catch (error) {
      showTransferError(error, "settings.exportFailed");
    } finally {
      setBusy(null);
    }
  }

  async function handleImportFile(file) {
    if (!file || busyOperation) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      showToast(t("error.fileTooLarge"), { type: "error" });
      refs.fileInput.value = "";
      return;
    }

    setBusy("import");
    try {
      let text;
      try {
        text = await file.text();
      } catch (error) {
        throw new DataTransferError("error.fileRead", {}, { cause: error });
      }

      const envelope = parseImportText(text);
      const confirmed = await showDialog({
        title: t("settings.importConfirmTitle"),
        message: t("settings.importConfirmBody"),
        confirmLabel: t("settings.importConfirm")
      });
      if (!confirmed) {
        return;
      }

      const result = await importExpenseData(envelope);
      showToast(t("settings.importSuccess", result));
      refreshAfterMutation();
    } catch (error) {
      showTransferError(error, "settings.importFailed");
    } finally {
      refs.fileInput.value = "";
      setBusy(null);
    }
  }

  async function handleClear() {
    if (busyOperation) {
      return;
    }
    const confirmed = await showDialog({
      title: t("settings.clearTitle"),
      message: t("settings.clearBody"),
      confirmLabel: t("settings.clearConfirm"),
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    setBusy("clear");
    try {
      await clearAllExpenses();
      showToast(t("settings.clearSuccess"));
      refreshAfterMutation();
    } catch (error) {
      showTransferError(error, "settings.clearFailed");
    } finally {
      setBusy(null);
    }
  }

  function render() {
    const { heading } = createPageHeading("settings.title");
    const locale = getLocale();
    const disabled = Boolean(busyOperation);
    const languageGroup = el("fieldset", { className: "choice-group" }, [
      el("legend", { text: t("settings.languageTitle") }),
      createLanguageChoice("zh-CN", t("settings.languageZh"), locale, disabled),
      createLanguageChoice("en-US", t("settings.languageEn"), locale, disabled)
    ]);
    const storageState = context.storageState ?? { supported: false, persistent: false };

    const exportAction = createActionButton({
      className: "button button--primary settings-action",
      label: busyOperation === "export" ? t("settings.exporting") : t("settings.export"),
      iconPath: "M12 3v12M7 10l5 5 5-5M5 21h14"
    });
    const importAction = createActionButton({
      className: "button button--secondary settings-action",
      label: busyOperation === "import" ? t("settings.importing") : t("settings.import"),
      iconPath: "M12 21V9M7 14l5-5 5 5M5 3h14"
    });
    const clearAction = createActionButton({
      className: "button settings-action settings-action--danger",
      label: t("settings.clearData"),
      iconPath: "M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"
    });
    const fileInput = el("input", {
      attrs: {
        type: "file",
        accept: ".json,application/json",
        hidden: true,
        disabled
      }
    });
    const countValue = el("p", {
      className: "settings-count",
      text: t("settings.recordTotal", { count }),
      attrs: { "aria-live": "polite" }
    });
    const recordValue = el("span", {
      className: "status-row__value",
      text: t("settings.recordTotal", { count }),
      attrs: { "aria-live": "polite" }
    });

    exportAction.button.addEventListener("click", handleExport);
    importAction.button.addEventListener("click", () => fileInput.click());
    clearAction.button.addEventListener("click", handleClear);
    fileInput.addEventListener("change", () => {
      void handleImportFile(fileInput.files?.[0]);
    });

    const nextRoot = el("section", {}, [
      heading,
      el("section", { className: "page-section" }, [languageGroup]),
      el("section", { className: "page-section" }, [
        el("h2", {
          text: t("settings.dataTitle"),
          attrs: { style: "font-size: 1rem; margin: 0 0 10px;" }
        }),
        countValue,
        el("div", { className: "settings-actions" }, [
          exportAction.button,
          importAction.button,
          clearAction.button
        ]),
        fileInput
      ]),
      el("section", { className: "page-section" }, [
        el("h2", { text: t("settings.storageTitle"), attrs: { style: "font-size: 1rem; margin: 0 0 10px;" } }),
        el("div", { className: "status-list" }, [
          createStatusRow(
            t("settings.storageTitle"),
            storageLabel(storageState),
            storageState.persistent ? "ok" : "warning"
          ),
          el("div", { className: "status-row" }, [
            el("span", {
              className: "status-row__label",
              text: t("settings.schemaVersion", { version: DB_VERSION })
            }),
            recordValue
          ])
        ])
      ])
    ]);

    if (root?.parentNode) {
      root.replaceWith(nextRoot);
    }
    root = nextRoot;
    refs = {
      exportButton: exportAction.button,
      exportLabel: exportAction.text,
      importButton: importAction.button,
      importLabel: importAction.text,
      clearButton: clearAction.button,
      clearLabel: clearAction.text,
      fileInput,
      countValue,
      recordValue,
      languageInputs: nextRoot.querySelectorAll('input[name="language"]')
    };
  }

  return {
    async mount(outlet) {
      try {
        count = await getExpenseCount();
      } catch (error) {
        console.error(error);
      }
      render();
      outlet.append(root);
    },
    refreshLocale() {
      if (!root?.parentNode) {
        return;
      }
      render();
    },
    destroy() {
      root?.remove();
      root = null;
    }
  };
}
