import { parseAmountToCents, centsToAmountInput } from "../amount.js";
import { CATEGORIES, MAX_NOTE_LENGTH, PAYMENTS } from "../constants.js";
import {
  epochFromLocalDateTimeInput,
  toLocalDateTimeInput
} from "../dates.js";
import {
  createExpense,
  ExpenseValidationError,
  getExpense,
  updateExpense
} from "../expenses.js";
import { t } from "../i18n.js";
import {
  createPageHeading,
  el,
  showDialog,
  showToast
} from "../ui.js";

const fieldOrder = ["datetime", "amountCents", "category", "payment", "note"];

function defaultState() {
  return {
    datetime: toLocalDateTimeInput(Date.now()),
    amount: "",
    category: "",
    note: "",
    payment: ""
  };
}

function stateFromRecord(record) {
  return {
    datetime: toLocalDateTimeInput(record.datetime),
    amount: centsToAmountInput(record.amountCents),
    category: record.category,
    note: record.note ?? "",
    payment: record.payment
  };
}

function countCharacters(value) {
  return Array.from(String(value)).length;
}

function requiredMark() {
  return [
    el("span", { className: "required-mark", text: "*", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "visually-hidden", text: t("common.required") })
  ];
}

function requiredLabel(text, inputId) {
  const label = el("label", { text, attrs: { for: inputId } });
  label.append(...requiredMark());
  return label;
}

function fieldError(id) {
  return el("p", {
    className: "field-error",
    attrs: { id, role: "alert" },
    text: ""
  });
}

export function createPage({ route, context, navigate }) {
  const isEdit = route.name === "edit";
  const editId = route.params.id;
  let root = null;
  let form = null;
  let controls = null;
  let fieldTargets = null;
  let errorNodes = null;
  let errorSummary = null;
  let noteCounter = null;
  let submitButton = null;
  let cancelButton = null;
  let currentErrors = {};
  let initialSnapshot = null;
  let saving = false;

  function readState() {
    if (!controls) {
      return defaultState();
    }
    return {
      datetime: controls.datetime.value,
      amount: controls.amountCents.value,
      category: form.querySelector('input[name="category"]:checked')?.value ?? "",
      note: controls.note.value,
      payment: form.querySelector('input[name="payment"]:checked')?.value ?? ""
    };
  }

  function snapshot(value = readState()) {
    return JSON.stringify(value);
  }

  function isDirty() {
    return Boolean(form && !saving && snapshot() !== initialSnapshot);
  }

  function clearFieldError(field) {
    if (!currentErrors[field]) {
      return;
    }
    delete currentErrors[field];
    const errorNode = errorNodes?.[field];
    const target = fieldTargets?.[field];
    if (errorNode) {
      errorNode.hidden = true;
      errorNode.textContent = "";
    }
    target?.setAttribute("aria-invalid", "false");
    target?.classList.remove("is-invalid");
    if (errorSummary) {
      errorSummary.hidden = Object.keys(currentErrors).length === 0;
    }
  }

  function applyErrors(errors) {
    currentErrors = { ...errors };
    for (const field of fieldOrder) {
      const key = currentErrors[field];
      const errorNode = errorNodes?.[field];
      const target = fieldTargets?.[field];
      if (!errorNode || !target) {
        continue;
      }
      errorNode.hidden = !key;
      errorNode.textContent = key ? t(key) : "";
      target.setAttribute("aria-invalid", key ? "true" : "false");
      target.classList.toggle("is-invalid", Boolean(key));
    }
    if (errorSummary) {
      errorSummary.hidden = Object.keys(currentErrors).length === 0;
    }
  }

  function focusFirstInvalid() {
    const field = fieldOrder.find((name) => currentErrors[name]);
    const target = field ? fieldTargets?.[field] : null;
    if (!target) {
      return;
    }
    if (target.matches("fieldset")) {
      target.querySelector("input")?.focus();
    } else {
      target.focus();
    }
  }

  function validate() {
    const errors = {};
    const amount = parseAmountToCents(controls.amountCents.value);
    const datetime = epochFromLocalDateTimeInput(controls.datetime.value);
    const category = form.querySelector('input[name="category"]:checked')?.value ?? "";
    const payment = form.querySelector('input[name="payment"]:checked')?.value ?? "";
    const note = controls.note.value.trim();

    if (datetime === null) {
      errors.datetime = "form.dateInvalid";
    }
    if (!amount.ok) {
      errors.amountCents = amount.errorKey;
    }
    if (!CATEGORIES.includes(category)) {
      errors.category = "form.categoryRequired";
    }
    if (!PAYMENTS.includes(payment)) {
      errors.payment = "form.paymentRequired";
    }
    if (countCharacters(note) > MAX_NOTE_LENGTH) {
      errors.note = "form.noteTooLong";
    }

    applyErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid();
      return null;
    }

    return {
      datetime,
      amountCents: amount.amountCents,
      category,
      note,
      payment
    };
  }

  function updateNoteCounter() {
    if (noteCounter) {
      noteCounter.textContent = `${countCharacters(controls.note.value)} / ${MAX_NOTE_LENGTH}`;
    }
  }

  function createChoiceFieldset({ name, legendKey, values, selected, labelForValue }) {
    const errorId = `${name}-error`;
    const error = fieldError(errorId);
    const fieldset = el("fieldset", {
      className: "form-field choice-fieldset",
      attrs: { "aria-describedby": errorId }
    });
    fieldset.append(el("legend", {}, [document.createTextNode(t(legendKey)), ...requiredMark()]));

    const choices = el("div", { className: "choice-grid" });
    for (const value of values) {
      const input = el("input", {
        attrs: {
          type: "radio",
          name,
          value,
          checked: value === selected
        }
      });
      choices.append(
        el("label", { className: "choice-chip" }, [
          input,
          document.createTextNode(labelForValue(value))
        ])
      );
    }

    fieldset.append(choices, error);
    return { fieldset, error, errorId };
  }

  function renderForm(state, { errors = {}, snapshotValue } = {}) {
    const { heading, intro } = createPageHeading(
      isEdit ? "form.editTitle" : "form.addTitle",
      "form.requiredHint"
    );

    errorSummary = el("div", {
      className: "form-error-summary",
      text: t("form.validationSummary"),
      attrs: { role: "alert" }
    });

    const datetimeInput = el("input", {
      attrs: {
        id: "expense-datetime",
        name: "datetime",
        type: "datetime-local",
        step: "60",
        required: true,
        "aria-describedby": "datetime-error"
      }
    });
    datetimeInput.value = state.datetime;
    const datetimeError = fieldError("datetime-error");

    const amountInput = el("input", {
      attrs: {
        id: "expense-amount",
        name: "amountCents",
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        enterkeyhint: "next",
        placeholder: t("form.amountPlaceholder"),
        "aria-describedby": "amount-error"
      }
    });
    amountInput.value = state.amount;
    const amountError = fieldError("amount-error");

    const categoryField = createChoiceFieldset({
      name: "category",
      legendKey: "form.categoryLegend",
      values: CATEGORIES,
      selected: state.category,
      labelForValue: (value) => t(`category.${value}`)
    });

    const noteInput = el("textarea", {
      attrs: {
        id: "expense-note",
        name: "note",
        rows: "3",
        placeholder: t("form.notePlaceholder"),
        "aria-describedby": "note-error note-counter"
      }
    });
    noteInput.value = state.note;
    const noteError = fieldError("note-error");
    noteCounter = el("span", {
      className: "character-count",
      attrs: { id: "note-counter" },
      text: `${countCharacters(state.note)} / ${MAX_NOTE_LENGTH}`
    });

    const paymentField = createChoiceFieldset({
      name: "payment",
      legendKey: "form.paymentLegend",
      values: PAYMENTS,
      selected: state.payment,
      labelForValue: (value) => t(`payment.${value}`)
    });

    submitButton = el("button", {
      className: "button button--primary form-submit",
      text: t(isEdit ? "form.saveEdit" : "form.saveAdd"),
      attrs: { type: "submit" }
    });
    cancelButton = isEdit
      ? el("button", {
          className: "button button--secondary",
          text: t("common.cancel"),
          attrs: { type: "button" }
        })
      : null;

    cancelButton?.addEventListener("click", async () => {
      if (await canLeave()) {
        navigate("/records");
      }
    });

    form = el(
      "form",
      {
        className: "expense-form",
        attrs: { novalidate: true, "aria-busy": "false" }
      },
      [
        errorSummary,
        el("div", { className: "form-field" }, [
          requiredLabel(t("form.dateLabel"), "expense-datetime"),
          datetimeInput,
          datetimeError
        ]),
        el("div", { className: "form-field form-field--amount" }, [
          requiredLabel(t("form.amountLabel"), "expense-amount"),
          amountInput,
          amountError
        ]),
        categoryField.fieldset,
        el("div", { className: "form-field" }, [
          el("div", { className: "field-label-row" }, [
            el("label", {
              text: t("form.noteLabel"),
              attrs: { for: "expense-note" }
            }),
            noteCounter
          ]),
          noteInput,
          noteError
        ]),
        paymentField.fieldset,
        el("div", { className: "form-actions" }, [
          cancelButton,
          submitButton
        ])
      ]
    );

    controls = {
      datetime: datetimeInput,
      amountCents: amountInput,
      note: noteInput
    };
    fieldTargets = {
      datetime: datetimeInput,
      amountCents: amountInput,
      category: categoryField.fieldset,
      payment: paymentField.fieldset,
      note: noteInput
    };
    errorNodes = {
      datetime: datetimeError,
      amountCents: amountError,
      category: categoryField.error,
      payment: paymentField.error,
      note: noteError
    };
    initialSnapshot = snapshotValue ?? snapshot(state);
    currentErrors = {};

    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", handleFieldActivity);
    form.addEventListener("change", handleFieldActivity);
    noteInput.addEventListener("input", updateNoteCounter);

    const nextRoot = el("section", {}, [
      heading,
      intro,
      el("section", { className: "page-section" }, [form])
    ]);
    root.replaceWith(nextRoot);
    root = nextRoot;
    errorSummary.hidden = true;
    applyErrors(errors);
    updateNoteCounter();
  }

  function handleFieldActivity(event) {
    const field = event.target.name;
    if (field) {
      clearFieldError(field);
    }
  }

  function setSaving(nextSaving) {
    saving = nextSaving;
    form?.setAttribute("aria-busy", String(nextSaving));
    submitButton.disabled = nextSaving;
    if (cancelButton) {
      cancelButton.disabled = nextSaving;
    }
    submitButton.textContent = nextSaving
      ? t("form.saving")
      : t(isEdit ? "form.saveEdit" : "form.saveAdd");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const value = validate();
    if (!value) {
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateExpense(editId, value);
        initialSnapshot = snapshot();
        showToast(t("form.updateSuccess"));
        navigate("/records");
      } else {
        await createExpense(value);
        showToast(t("form.saveSuccess"));
        const nextState = defaultState();
        renderForm(nextState, { snapshotValue: snapshot(nextState) });
        root.querySelector("h1")?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (error instanceof ExpenseValidationError) {
        applyErrors(error.fields);
        focusFirstInvalid();
      }
      showToast(t("form.saveFailed"), { type: "error" });
      console.error(error);
    } finally {
      if (form?.isConnected) {
        setSaving(false);
      }
    }
  }

  function renderLoading() {
    const { heading, intro } = createPageHeading("form.editTitle", "common.loading");
    const nextRoot = el("section", {}, [
      heading,
      intro,
      el("div", { className: "loading-block", attrs: { role: "status" } }, [
        el("span", { className: "loading-dot", attrs: { "aria-hidden": "true" } }),
        el("span", { text: t("common.loading") })
      ])
    ]);
    if (root?.parentNode) {
      root.replaceWith(nextRoot);
    }
    root = nextRoot;
  }

  async function canLeave() {
    if (!isDirty()) {
      return true;
    }
    return showDialog({
      title: t("app.unsavedTitle"),
      message: t("app.unsavedBody"),
      confirmLabel: t("common.discard"),
      tone: "danger"
    });
  }

  function handleBeforeUnload(event) {
    if (!isDirty()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  }

  return {
    async mount(outlet) {
      globalThis.addEventListener("beforeunload", handleBeforeUnload);

      if (!isEdit) {
        const state = defaultState();
        const { heading, intro } = createPageHeading("form.addTitle", "form.requiredHint");
        root = el("section", {}, [heading, intro]);
        outlet.append(root);
        renderForm(state, { snapshotValue: snapshot(state) });
        return;
      }

      renderLoading();
      outlet.append(root);
      try {
        const record = await getExpense(editId);
        if (!record) {
          showToast(t("records.loadFailed"), { type: "error" });
          navigate("/records", { replace: true });
          return;
        }
        renderForm(stateFromRecord(record));
      } catch (error) {
        console.error(error);
        showToast(t("records.loadFailed"), { type: "error" });
        navigate("/records", { replace: true });
      }
    },
    refreshLocale() {
      if (!form?.isConnected || saving) {
        return;
      }
      const state = readState();
      renderForm(state, {
        errors: currentErrors,
        snapshotValue: initialSnapshot
      });
    },
    canLeave,
    destroy() {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
      form = null;
      controls = null;
      fieldTargets = null;
      errorNodes = null;
      submitButton = null;
      cancelButton = null;
      root?.remove();
      root = null;
    }
  };
}
