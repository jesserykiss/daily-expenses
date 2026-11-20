import {
  mountBarChart,
  mountLineChart,
  mountPieChart,
  CHART_COLORS
} from "../canvas-chart.js";
import {
  DEFAULT_TREND_MONTHS,
  TREND_MONTH_OPTIONS
} from "../constants.js";
import {
  currentMonthKey,
  monthKeyFromDate,
  monthKeysBetween
} from "../dates.js";
import { getMonthBounds } from "../expenses.js";
import {
  formatCurrency,
  formatMonthKey,
  formatNumber,
  formatPercent,
  formatShortMonth
} from "../format.js";
import { t } from "../i18n.js";
import { buildInsights } from "../insights.js";
import { aggregateStatistics } from "../statistics.js";
import { createPageHeading, el } from "../ui.js";

let chartId = 0;

function createSummaryCard(label, value) {
  return el("article", { className: "stat-card" }, [
    el("span", { className: "stat-card__label", text: label }),
    el("strong", { className: "stat-card__value", text: value })
  ]);
}

function createDataTable(title, headers, rows) {
  const table = el("table", {}, [
    el("caption", { className: "visually-hidden", text: title }),
    el("thead", {}, [
      el("tr", {}, headers.map((header) =>
        el("th", { text: header, attrs: { scope: "col" } })
      ))
    ]),
    el("tbody", {}, rows.map((row) =>
      el("tr", {}, row.map((value, index) =>
        el(index === 0 ? "th" : "td", {
          text: value,
          attrs: index === 0 ? { scope: "row" } : {}
        })
      ))
    ))
  ]);

  return el("details", { className: "chart-data" }, [
    el("summary", { text: `${title} · ${t("stats.dataTable")}` }),
    el("div", { className: "table-scroll" }, [table])
  ]);
}

function createChartCard({ title, ariaLabel, type, data, headers, rows }) {
  chartId += 1;
  const canvas = el("canvas", {
    className: `chart-canvas chart-canvas--${type}`,
    attrs: {
      role: "img",
      "aria-label": ariaLabel
    }
  });
  const fallback = el("p", {
    className: "chart-fallback",
    text: t("stats.chartFallback")
  });
  fallback.hidden = true;

  const section = el("section", { className: "chart-section surface" }, [
    el("h2", { text: title }),
    el("div", {
      className: "chart-canvas-frame",
      attrs: { id: `chart-frame-${chartId}` }
    }, [canvas, fallback]),
    createDataTable(title, headers, rows)
  ]);

  return { section, canvas, fallback, type, data };
}

function insightParams(insight) {
  const params = { ...insight.params };
  if (params.category) {
    params.category = t(`category.${params.category}`);
  }
  if (params.payment) {
    params.payment = t(`payment.${params.payment}`);
  }
  if (Object.hasOwn(params, "amount")) {
    params.amount = formatCurrency(params.amount);
  }
  if (Object.hasOwn(params, "average")) {
    params.average = formatCurrency(params.average);
  }
  if (Object.hasOwn(params, "share")) {
    params.share = formatPercent(params.share);
  }
  if (Object.hasOwn(params, "percent")) {
    params.percent = formatPercent(params.percent);
  }
  if (Object.hasOwn(params, "count")) {
    params.count = formatNumber(params.count);
  }
  return params;
}

function createInsightsSection(statistics) {
  const insights = buildInsights(statistics);
  const body = insights.length
    ? el("ol", { className: "insight-list" }, insights.map((insight) =>
        el("li", { text: t(insight.key, insightParams(insight)) })
      ))
    : el("p", { className: "page-intro", text: t("insight.empty") });

  return el("section", { className: "insight-section surface" }, [
    el("h2", { text: t("insight.title") }),
    body
  ]);
}

function createEmptyState() {
  return el("div", { className: "surface empty-state" }, [
    el("h2", { text: t("stats.emptyTitle") }),
    el("p", { text: t("stats.emptyBody") }),
    el("a", {
      className: "button button--primary",
      text: t("records.addCta"),
      attrs: { href: "#/add" }
    })
  ]);
}

export function createPage({ context }) {
  let selectedMonth = context.statsView?.month ?? currentMonthKey();
  let trendMonths = context.statsView?.trendMonths ?? DEFAULT_TREND_MONTHS;
  let root = null;
  let monthSelect = null;
  let contentHost = null;
  let loadToken = 0;
  let chartControllers = [];

  if (!TREND_MONTH_OPTIONS.includes(trendMonths)) {
    trendMonths = DEFAULT_TREND_MONTHS;
  }

  function syncContext() {
    context.statsView = {
      month: selectedMonth,
      trendMonths
    };
  }

  function destroyCharts() {
    for (const controller of chartControllers) {
      controller.destroy();
    }
    chartControllers = [];
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

  function createTrendToggle() {
    const group = el("div", {
      className: "segmented-control",
      attrs: {
        role: "group",
        "aria-label": t("stats.trendTitle")
      }
    });
    for (const range of TREND_MONTH_OPTIONS) {
      const button = el("button", {
        className: "segment-button",
        text: t(range === 6 ? "stats.trend6" : "stats.trend12"),
        attrs: {
          type: "button",
          "aria-pressed": String(range === trendMonths)
        }
      });
      button.addEventListener("click", () => {
        if (range === trendMonths) {
          return;
        }
        trendMonths = range;
        syncContext();
        loadStatistics();
        for (const item of group.querySelectorAll("button")) {
          item.setAttribute(
            "aria-pressed",
            String(item === button)
          );
        }
      });
      group.append(button);
    }
    return group;
  }

  function mountPendingCharts(pending) {
    for (const item of pending) {
      if (typeof item.canvas.getContext !== "function" || !item.canvas.getContext("2d")) {
        item.canvas.hidden = true;
        item.fallback.hidden = false;
        continue;
      }
      const mount = item.type === "bar"
        ? mountBarChart
        : item.type === "pie"
          ? mountPieChart
          : mountLineChart;
      chartControllers.push(mount(item.canvas, item.data));
    }
  }

  function renderStatistics(statistics) {
    destroyCharts();
    syncContext();

    const allTrendEmpty = statistics.trend.every((month) => month.totalCents === 0);
    if (statistics.totalCents === 0 && allTrendEmpty) {
      contentHost.replaceChildren(createEmptyState());
      return;
    }

    const pendingCharts = [];
    const sections = [];
    const summary = el("section", {
      className: "stats-summary",
      attrs: { "aria-label": t("stats.title") }
    }, [
      createSummaryCard(t("stats.total"), formatCurrency(statistics.totalCents)),
      createSummaryCard(t("stats.recordCount"), formatNumber(statistics.count)),
      createSummaryCard(t("stats.average"), formatCurrency(statistics.averageCents))
    ]);
    sections.push(summary, createInsightsSection(statistics));

    if (statistics.totalCents === 0) {
      sections.push(createEmptyState());
    } else {
      const categoryChart = createChartCard({
        title: t("stats.categoryTitle"),
        ariaLabel: t("stats.categoryChartAria"),
        type: "bar",
        data: statistics.categories.map((category, index) => ({
          label: t(`category.${category.key}`),
          value: category.amountCents,
          color: CHART_COLORS[index % CHART_COLORS.length]
        })),
        headers: [
          t("stats.categoryColumn"),
          t("stats.amountColumn"),
          t("stats.countColumn"),
          t("stats.shareColumn")
        ],
        rows: statistics.categories.map((category) => [
          t(`category.${category.key}`),
          formatCurrency(category.amountCents),
          formatNumber(category.count),
          formatPercent(category.share)
        ])
      });
      const paymentChart = createChartCard({
        title: t("stats.paymentTitle"),
        ariaLabel: t("stats.paymentChartAria"),
        type: "pie",
        data: statistics.payments.map((payment, index) => ({
          label: t(`payment.${payment.key}`),
          value: payment.amountCents,
          color: CHART_COLORS[(index + 2) % CHART_COLORS.length]
        })),
        headers: [
          t("stats.paymentColumn"),
          t("stats.amountColumn"),
          t("stats.countColumn"),
          t("stats.shareColumn")
        ],
        rows: statistics.payments.map((payment) => [
          t(`payment.${payment.key}`),
          formatCurrency(payment.amountCents),
          formatNumber(payment.count),
          formatPercent(payment.share)
        ])
      });
      pendingCharts.push(categoryChart, paymentChart);
      sections.push(
        el("div", { className: "chart-grid" }, [
          categoryChart.section,
          paymentChart.section
        ])
      );
    }

    if (!allTrendEmpty) {
      const trendChart = createChartCard({
        title: t("stats.trendTitle"),
        ariaLabel: t("stats.trendChartAria"),
        type: "line",
        data: statistics.trend.map((month) => ({
          label: formatShortMonth(month.month),
          value: month.totalCents
        })),
        headers: [
          t("stats.monthColumn"),
          t("stats.totalColumn"),
          t("stats.countColumn")
        ],
        rows: statistics.trend.map((month) => [
          formatMonthKey(month.month),
          formatCurrency(month.totalCents),
          formatNumber(month.count)
        ])
      });
      pendingCharts.push(trendChart);
      sections.push(trendChart.section);
    }

    contentHost.replaceChildren(...sections);
    mountPendingCharts(pendingCharts);
  }

  async function loadStatistics() {
    const token = ++loadToken;
    destroyCharts();
    contentHost.replaceChildren(
      el("div", { className: "loading-block", attrs: { role: "status" } }, [
        el("span", { className: "loading-dot", attrs: { "aria-hidden": "true" } }),
        el("span", { text: t("stats.loading") })
      ])
    );

    try {
      const statistics = await aggregateStatistics({
        month: selectedMonth,
        trendMonths
      });
      if (token !== loadToken) {
        return;
      }
      renderStatistics(statistics);
    } catch (error) {
      if (token !== loadToken) {
        return;
      }
      console.error(error);
      const retry = el("button", {
        className: "button button--secondary",
        text: t("common.retry"),
        attrs: { type: "button" }
      });
      retry.addEventListener("click", loadStatistics);
      contentHost.replaceChildren(
        el("div", { className: "surface error-state", attrs: { role: "alert" } }, [
          el("p", { text: t("stats.loadFailed") }),
          retry
        ])
      );
    }
  }

  function buildPage() {
    loadToken += 1;
    const { heading } = createPageHeading("stats.title");
    monthSelect = el("select", { attrs: { id: "stats-month" } });
    monthSelect.addEventListener("change", () => {
      selectedMonth = monthSelect.value;
      syncContext();
      loadStatistics();
    });

    const controls = el("section", { className: "stats-controls surface" }, [
      el("div", { className: "stats-controls__grid" }, [
        el("div", { className: "form-field" }, [
          el("label", {
            text: t("stats.monthLabel"),
            attrs: { for: "stats-month" }
          }),
          monthSelect
        ]),
        el("fieldset", { className: "form-field trend-field" }, [
          el("legend", { text: t("stats.trendTitle") }),
          createTrendToggle()
        ])
      ])
    ]);
    contentHost = el("div", { className: "stats-content" });
    const nextRoot = el("section", {}, [
      heading,
      el("section", { className: "page-section" }, [controls]),
      contentHost
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
      await loadStatistics();
    },
    refreshLocale() {
      if (!root?.isConnected) {
        return;
      }
      buildPage();
      void buildMonthOptions()
        .then(loadStatistics)
        .catch((error) => {
          console.error(error);
          void loadStatistics();
        });
    },
    destroy() {
      loadToken += 1;
      destroyCharts();
      root?.remove();
      root = null;
      monthSelect = null;
      contentHost = null;
    }
  };
}
