import assert from "node:assert/strict";
import test from "node:test";

import {
  AMOUNT_ERROR,
  centsToAmountInput,
  parseAmountToCents
} from "../src/amount.js";
import {
  addMonths,
  epochFromLocalDateTimeInput,
  monthKeyFromDate,
  monthKeysBetween,
  monthRange,
  toLocalDateTimeInput,
  trendMonthKeys
} from "../src/dates.js";
import { MAX_AMOUNT_CENTS } from "../src/constants.js";
import {
  buildFingerprint,
  createExportFilename,
  parseImportText,
  validateImportEnvelope
} from "../src/data-transfer.js";
import { validateExpenseFields } from "../src/expenses.js";
import { buildInsights } from "../src/insights.js";
import { createStatisticsAccumulator } from "../src/statistics.js";

test("amount parser converts yuan to integer cents", () => {
  assert.deepEqual(parseAmountToCents("25.80"), { ok: true, amountCents: 2580 });
  assert.deepEqual(parseAmountToCents("25,8"), { ok: true, amountCents: 2580 });
  assert.deepEqual(parseAmountToCents("0.01"), { ok: true, amountCents: 1 });
  assert.deepEqual(parseAmountToCents("１２．３４"), { ok: true, amountCents: 1234 });
});

test("amount parser rejects zero, negatives, excessive precision, and grouping", () => {
  assert.deepEqual(parseAmountToCents("0"), {
    ok: false,
    errorKey: AMOUNT_ERROR.ZERO
  });
  assert.deepEqual(parseAmountToCents("-1"), {
    ok: false,
    errorKey: AMOUNT_ERROR.INVALID
  });
  assert.deepEqual(parseAmountToCents("1.234"), {
    ok: false,
    errorKey: AMOUNT_ERROR.INVALID
  });
  assert.deepEqual(parseAmountToCents("1,234.00"), {
    ok: false,
    errorKey: AMOUNT_ERROR.INVALID
  });
});

test("amount parser enforces the upper bound and formats edit values", () => {
  assert.deepEqual(parseAmountToCents("99999999.99"), {
    ok: true,
    amountCents: MAX_AMOUNT_CENTS
  });
  assert.deepEqual(parseAmountToCents("100000000.00"), {
    ok: false,
    errorKey: AMOUNT_ERROR.TOO_LARGE
  });
  assert.equal(centsToAmountInput(2580), "25.80");
});

test("local month ranges cross years and use local calendar months", () => {
  const december = monthRange("2025-12");
  const january = monthRange("2026-01");
  assert.equal(january.start, december.end);
  assert.equal(new Date(december.start).getDate(), 1);
  assert.equal(new Date(december.start).getMonth(), 11);
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2025-12", 1), "2026-01");
});

test("trend month keys are ordered and include the selected month", () => {
  assert.deepEqual(trendMonthKeys("2026-03", 6), [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03"
  ]);
});

test("local datetime input rejects calendar rollover", () => {
  assert.equal(epochFromLocalDateTimeInput("2026-02-30T10:00"), null);
  assert.equal(epochFromLocalDateTimeInput("2026-02-20T10:00"), new Date(2026, 1, 20, 10, 0).getTime());
  const epoch = new Date(2026, 10, 20, 9, 5).getTime();
  assert.equal(toLocalDateTimeInput(epoch), "2026-11-20T09:05");
});

test("month ranges cross year boundaries without fixed day counts", () => {
  assert.deepEqual(monthKeysBetween("2025-11", "2026-02"), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02"
  ]);
  assert.equal(monthKeyFromDate(new Date(2026, 10, 20).getTime()), "2026-11");
});

test("expense field validation enforces enums, amounts, and Unicode note length", () => {
  const valid = validateExpenseFields({
    datetime: new Date(2026, 10, 20, 12, 30).getTime(),
    category: "meals",
    amountCents: 2580,
    note: "  午餐  ",
    payment: "wechat"
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.note, "午餐");

  const invalid = validateExpenseFields({
    datetime: 0,
    category: "unknown",
    amountCents: 0,
    note: "😀".repeat(201),
    payment: "unknown"
  });
  assert.deepEqual(Object.keys(invalid.fields).sort(), [
    "amountCents",
    "category",
    "datetime",
    "note",
    "payment"
  ]);
});

test("statistics aggregate selected month, prior month, and zero-filled trend", () => {
  const accumulator = createStatisticsAccumulator({
    month: "2026-01",
    trendMonths: 6
  });
  const records = [
    { datetime: new Date(2025, 10, 10).getTime(), category: "meals", payment: "wechat", amountCents: 1000 },
    { datetime: new Date(2025, 11, 8).getTime(), category: "meals", payment: "wechat", amountCents: 5000 },
    { datetime: new Date(2026, 0, 4).getTime(), category: "meals", payment: "wechat", amountCents: 2000 },
    { datetime: new Date(2026, 0, 12).getTime(), category: "meals", payment: "cash", amountCents: 2000 },
    { datetime: new Date(2026, 0, 20).getTime(), category: "meals", payment: "wechat", amountCents: 2000 },
    { datetime: new Date(2026, 0, 21).getTime(), category: "clothing", payment: "wechat", amountCents: 4000 }
  ];
  records.forEach((record) => accumulator.add(record));
  const statistics = accumulator.finish();

  assert.equal(statistics.totalCents, 10000);
  assert.equal(statistics.count, 4);
  assert.equal(statistics.averageCents, 2500);
  assert.equal(statistics.previousTotalCents, 5000);
  assert.equal(statistics.changeRatio, 1);
  assert.deepEqual(
    statistics.categories.map((item) => [item.key, item.amountCents, item.count, item.share]),
    [
      ["meals", 6000, 3, 0.6],
      ["clothing", 4000, 1, 0.4]
    ]
  );
  assert.deepEqual(
    statistics.payments.map((item) => [item.key, item.amountCents]),
    [
      ["wechat", 8000],
      ["cash", 2000]
    ]
  );
  assert.deepEqual(
    statistics.trend.map((item) => [item.month, item.totalCents]),
    [
      ["2025-08", 0],
      ["2025-09", 0],
      ["2025-10", 0],
      ["2025-11", 1000],
      ["2025-12", 5000],
      ["2026-01", 10000]
    ]
  );
});

test("insights use semantic keys and follow top-category, change, and average rules", () => {
  const statistics = {
    totalCents: 10000,
    previousTotalCents: 5000,
    count: 4,
    averageCents: 2500,
    changeRatio: 1,
    categories: [
      { key: "meals", amountCents: 6000, count: 3, share: 0.6 },
      { key: "clothing", amountCents: 4000, count: 1, share: 0.4 }
    ],
    payments: [
      { key: "wechat", amountCents: 8000, count: 3, share: 0.8 },
      { key: "cash", amountCents: 2000, count: 1, share: 0.2 }
    ]
  };
  const insights = buildInsights(statistics);

  assert.deepEqual(insights.map((insight) => insight.key), [
    "insight.topCategory",
    "insight.momUp",
    "insight.highestAverage"
  ]);
  assert.equal(insights[0].params.share, 0.6);
  assert.equal(insights[1].params.percent, 1);
  assert.equal(insights[2].params.category, "clothing");
  assert.equal(insights[2].params.average, 4000);
});

test("insights handle empty and single-record months", () => {
  assert.deepEqual(buildInsights({ totalCents: 0, count: 0 }), []);

  const single = buildInsights({
    totalCents: 2580,
    previousTotalCents: 0,
    count: 1,
    averageCents: 2580,
    changeRatio: null,
    categories: [{ key: "meals", amountCents: 2580, count: 1, share: 1 }],
    payments: [{ key: "wechat", amountCents: 2580, count: 1, share: 1 }]
  });
  assert.deepEqual(single.map((insight) => insight.key), [
    "insight.topCategory",
    "insight.momFromZero",
    "insight.monthSummary"
  ]);
});

test("import parser validates the envelope, strips ids, and normalizes notes", () => {
  const envelope = {
    format: "daily-expenses",
    schemaVersion: 1,
    exportedAt: "2026-11-20T00:00:00.000Z",
    records: [
      {
        id: 99,
        datetime: new Date(2026, 10, 20, 12, 0).getTime(),
        category: "meals",
        amountCents: 2580,
        note: "  Cafe\u0301  ",
        payment: "wechat",
        createdAt: 1,
        updatedAt: 2,
        ignored: true
      }
    ]
  };
  const parsed = parseImportText(JSON.stringify(envelope));
  assert.equal(parsed.records[0].note, "Café");
  assert.equal(Object.hasOwn(parsed.records[0], "id"), false);
  assert.equal(Object.hasOwn(parsed.records[0], "ignored"), false);
  assert.equal(buildFingerprint(parsed.records[0]), buildFingerprint({
    ...parsed.records[0],
    note: "Café"
  }));
});

test("import validation rejects malformed, unsupported, and invalid records", () => {
  assert.throws(
    () => parseImportText("{"),
    (error) => error.code === "error.invalidJson"
  );
  assert.throws(
    () => validateImportEnvelope({
      format: "daily-expenses",
      schemaVersion: 2,
      exportedAt: "2026-11-20T00:00:00.000Z",
      records: []
    }),
    (error) => error.code === "error.unsupportedSchema" && error.params.version === "2"
  );
  assert.throws(
    () => validateImportEnvelope({
      format: "daily-expenses",
      schemaVersion: 1,
      exportedAt: "2026-11-20T00:00:00.000Z",
      records: [{
        datetime: new Date(2026, 10, 20).getTime(),
        category: "invalid",
        amountCents: 100,
        note: "",
        payment: "cash"
      }]
    }),
    (error) => error.code === "error.invalidRecord" && error.params.index === 1
  );
});

test("export filename is stable and local-time based", () => {
  assert.match(
    createExportFilename(new Date(2026, 10, 20, 9, 5)),
    /^daily-expenses-20261120-0905\.json$/
  );
});
