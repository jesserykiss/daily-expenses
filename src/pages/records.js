import { CATEGORIES } from "../constants.js";
import {
  currentMonthKey,
  monthKeyFromDate,
  monthKeysBetween
} from "../dates.js";
import {
  deleteExpense,
  getMonthBounds,
  queryExpenses
} from "../expenses.js";
import {
  formatCurrency,
  formatDateTime,
  formatMonthKey
} from "../format.js";
import { t } from "../i18n.js";
import {
  createPageHeading,
  el,
  showDialog,
  showToast
} from "../ui.js";

function createActionIcon(path) {
  const icon = el("svg", {
    attrs: {
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      "aria-hidden": "true"
    }
  });
  icon.append(el("path", { attrs: { d: path } }));
  return icon;
}

function loadingBlock(label) {
  return el("div", { className: "loading-block", attrs: { role: "status" } }, [
    el("span", { className: "loading-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { text: label })
  ]);
}

export function createPage({ context, navigate }) {
  let selectedMonth = context.recordsView?.month ?? currentMonthKey();
  let selectedCategory = context.recordsView?.category ?? "";
  let currentPage = context.recordsView?.page ?? 1;
  let root = null;
  let monthSelect = null;
  let categorySelect = null;
  let resultsHost = null;
  let loadToken = 0;

  if (!CATEGORIES.includes(selectedCategory)) {
    selectedCategory = "";
  }

  function syncContext() {
    context.recordsView = {
      month: selectedMonth,
      category: selectedCategory,
      page: currentPage
    };
  }

  async function buildMonthOptions() {
    const bounds = await getMonthBounds();
    const current = currentMonthKey();
    const first = bounds ? monthKeyFromDate(bounds.firstDatetime) : current;
    const last = bounds ? monthKeyFromDate(bounds.lastDatetime) : current;
    const start = first.localeCompare(current) < 0 ? first : current;
    const end = last.localeCompare(current) > 0 ? last : current;
    const months = monthKeysBetween(start, end);

    if (!months.includes(selectedMonth)) {
      months.push(selectedMonth);
    }
    months.sort((left, right) => right.localeCompare(left));

    monthSelect.replaceChildren(
      ...months.map((monthKey) =>
        el("option", {
          text: formatMonthKey(monthKey),
          attrs: { value: monthKey }
        })
      )
    );
    monthSelect.value = selectedMonth;
  }

  function buildFilters() {
    const monthField = el("div", { className: "form-field" }, [
      el("label", {
        text: t("records.monthLabel"),
        attrs: { for: "records-month" }
      }),
      monthSelect
    ]);
    const categoryField = el("div", { className: "form-field" }, [
      el("label", {
        text: t("records.categoryLabel"),
        attrs: { for: "records-category" }
      }),
      categorySelect
    ]);

    return el("section", {
      className: "filter-panel surface",
      attrs: { "aria-label": t("records.title") }
    }, [el("div", { className: "filters-grid" }, [monthField, categoryField])]);
  }

  async function loadRecords() {
    const token = ++loadToken;
    resultsHost.replaceChildren(loadingBlock(t("records.loading")));
    syncContext();

    try {
      const result = await queryExpenses({
        month: selectedMonth,
        category: selectedCategory,
        page: currentPage
      });
      if (token !== loadToken) {
        return;
      }
      currentPage = result.page;
      syncContext();
      renderResults(result);
    } catch (error) {
      if (token !== loadToken) {
        return;
      }
      console.error(error);
      resultsHost.replaceChildren(
        el("div", { className: "surface error-state", attrs: { role: "alert" } }, [
          el("p", { text: t("records.loadFailed") }),
          createRetryButton()
        ])
      );
    }
  }

  function createRetryButton() {
    const button = el("button", {
      className: "button button--secondary",
      text: t("common.retry"),
      attrs: { type: "button" }
    });
    button.addEventListener("click", loadRecords);
    return button;
  }

  function recordSummary(record) {
    return `${t(`category.${record.category}`)} · ${formatCurrency(record.amountCents)}`;
  }

  function createRecordRow(record) {
    const summary = recordSummary(record);
    const editButton = el("button", {
      className: "record-action",
      attrs: {
        type: "button",
        "aria-label": t("records.editAria", { summary })
      }
    }, [
      createActionIcon("M4 20h4l10-10-4-4L4 16v4ZM13 7l4 4"),
      el("span", { text: t("common.edit") })
    ]);
    const deleteButton = el("button", {
      className: "record-action record-action--danger",
      attrs: {
        type: "button",
        "aria-label": t("records.deleteAria", { summary })
      }
    }, [
      createActionIcon("M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"),
      el("span", { text: t("common.delete") })
    ]);

    editButton.addEventListener("click", () => {
      syncContext();
      navigate(`/edit/${record.id}`);
    });
    deleteButton.addEventListener("click", async () => {
      const confirmed = await showDialog({
        title: t("records.deleteTitle"),
        message: t("records.deleteBody", { summary }),
        confirmLabel: t("common.delete"),
        tone: "danger"
      });
      if (!confirmed) {
        return;
      }

      try {
        await deleteExpense(record.id);
        showToast(t("records.deleteSuccess"));
        await buildMonthOptions();
        await loadRecords();
      } catch (error) {
        console.error(error);
        showToast(t("records.deleteFailed"), { type: "error" });
      }
    });

    return el("li", { className: "expense-row" }, [
      el("div", { className: "expense-row__main" }, [
        el("div", { className: "expense-row__head" }, [
          el("span", { className: "category-badge", text: t(`category.${record.category}`) }),
          el("strong", { className: "expense-row__amount", text: formatCurrency(record.amountCents) })
        ]),
        el("div", { className: "expense-row__meta" }, [
          el("time", { text: formatDateTime(record.datetime) }),
          el("span", { text: t(`payment.${record.payment}`) })
        ]),
        el("p", {
          className: `expense-row__note${record.note ? "" : " expense-row__note--empty"}`,
          text: record.note || t("records.noteEmpty")
        })
      ]),
      el("div", { className: "record-actions" }, [editButton, deleteButton])
    ]);
  }

  function renderResults(result) {
    if (result.total === 0) {
      resultsHost.replaceChildren(
        el("div", { className: "records-meta", text: t("records.summary", { count: 0 }) }),
        el("div", { className: "surface empty-state" }, [
          el("h2", { text: t("records.emptyTitle") }),
          el("p", { text: t("records.emptyBody") }),
          el("a", {
            className: "button button--primary",
            text: t("records.addCta"),
            attrs: { href: "#/add" }
          })
        ])
      );
      return;
    }

    const previousButton = el("button", {
      className: "button button--secondary",
      text: t("common.previous"),
      attrs: {
        type: "button",
        "aria-label": t("common.previous"),
        disabled: result.page <= 1
      }
    });
    const nextButton = el("button", {
      className: "button button--secondary",
      text: t("common.next"),
      attrs: {
        type: "button",
        "aria-label": t("common.next"),
        disabled: result.page >= result.pageCount
      }
    });
    previousButton.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        loadRecords();
      }
    });
    nextButton.addEventListener("click", () => {
      if (currentPage < result.pageCount) {
        currentPage += 1;
        loadRecords();
      }
    });

    resultsHost.replaceChildren(
      el("div", { className: "records-meta" }, [
        el("span", { text: t("records.summary", { count: result.total }) }),
        result.pageCount > 1
          ? el("span", {
              text: t("records.pageOf", { page: result.page, pages: result.pageCount })
            })
          : null
      ]),
      el("ul", { className: "expense-list" }, result.items.map(createRecordRow)),
      result.pageCount > 1
        ? el("nav", {
            className: "pagination",
            attrs: { "aria-label": t("records.title") }
          }, [previousButton, nextButton])
        : null
    );
  }

  function buildPage() {
    loadToken += 1;
    const { heading } = createPageHeading("records.title");
    const addLink = el("a", {
      className: "button button--primary",
      text: t("records.addCta"),
      attrs: { href: "#/add" }
    });

    monthSelect = el("select", { attrs: { id: "records-month" } });
    categorySelect = el("select", { attrs: { id: "records-category" } });
    categorySelect.append(
      el("option", {
        text: t("records.allCategories"),
        attrs: { value: "" }
      }),
      ...CATEGORIES.map((category) =>
        el("option", {
          text: t(`category.${category}`),
          attrs: { value: category }
        })
      )
    );
    categorySelect.value = selectedCategory;
    categorySelect.addEventListener("change", () => {
      selectedCategory = categorySelect.value;
      currentPage = 1;
      loadRecords();
    });
    monthSelect.addEventListener("change", () => {
      selectedMonth = monthSelect.value;
      currentPage = 1;
      loadRecords();
    });

    resultsHost = el("div", { className: "records-results" });
    const nextRoot = el("section", {}, [
      el("div", { className: "page-heading-row" }, [
        el("div", {}, [heading]),
        addLink
      ]),
      el("section", { className: "page-section" }, [buildFilters()]),
      resultsHost
    ]);

    if (root?.parentNode) {
      root.replaceWith(nextRoot);
    }
    root = nextRoot;
  }

  return {
    async mount(outlet) {
      buildPage();
      outlet.append(root);
      await buildMonthOptions();
      await loadRecords();
    },
    refreshLocale() {
      if (!root?.isConnected) {
        return;
      }
      buildPage();
      void buildMonthOptions()
        .then(loadRecords)
        .catch((error) => {
          console.error(error);
          showToast(t("records.loadFailed"), { type: "error" });
        });
    },
    destroy() {
      loadToken += 1;
      root?.remove();
      root = null;
      monthSelect = null;
      categorySelect = null;
      resultsHost = null;
    }
  };
}
