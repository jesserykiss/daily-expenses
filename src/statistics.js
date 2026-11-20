import {
  CATEGORIES,
  PAYMENTS,
  TREND_MONTH_OPTIONS
} from "./constants.js";
import { db } from "./db.js";
import {
  addMonths,
  monthKeyFromDate,
  monthRange,
  trendMonthKeys
} from "./dates.js";

function sortValue(left, right, list) {
  return (
    right.amountCents - left.amountCents ||
    right.count - left.count ||
    list.indexOf(left.key) - list.indexOf(right.key)
  );
}

function finalizeGroups(map, order, totalCents) {
  return Array.from(map, ([key, value]) => ({
    key,
    amountCents: value.amountCents,
    count: value.count,
    share: totalCents > 0 ? value.amountCents / totalCents : 0
  })).sort((left, right) => sortValue(left, right, order));
}

export function createStatisticsAccumulator({ month, trendMonths }) {
  if (!TREND_MONTH_OPTIONS.includes(trendMonths)) {
    throw new Error("Unsupported trend range");
  }

  const months = trendMonthKeys(month, trendMonths);
  const previousMonth = addMonths(month, -1);
  const trend = new Map(
    months.map((monthKey) => [monthKey, { totalCents: 0, count: 0 }])
  );
  const categories = new Map();
  const payments = new Map();
  let totalCents = 0;
  let count = 0;
  let previousTotalCents = 0;

  function addToGroup(map, key, amountCents) {
    const current = map.get(key) ?? { amountCents: 0, count: 0 };
    current.amountCents += amountCents;
    current.count += 1;
    map.set(key, current);
  }

  return {
    add(record) {
      const recordMonth = monthKeyFromDate(record.datetime);
      const trendValue = trend.get(recordMonth);
      if (!trendValue) {
        return;
      }

      const amountCents = Number(record.amountCents);
      trendValue.totalCents += amountCents;
      trendValue.count += 1;

      if (recordMonth === previousMonth) {
        previousTotalCents += amountCents;
      }

      if (recordMonth === month) {
        totalCents += amountCents;
        count += 1;
        if (CATEGORIES.includes(record.category)) {
          addToGroup(categories, record.category, amountCents);
        }
        if (PAYMENTS.includes(record.payment)) {
          addToGroup(payments, record.payment, amountCents);
        }
      }
    },
    finish() {
      return {
        month,
        trendMonths,
        totalCents,
        count,
        averageCents: count > 0 ? totalCents / count : 0,
        previousTotalCents,
        changeRatio:
          previousTotalCents > 0
            ? (totalCents - previousTotalCents) / previousTotalCents
            : null,
        categories: finalizeGroups(categories, CATEGORIES, totalCents),
        payments: finalizeGroups(payments, PAYMENTS, totalCents),
        trend: months.map((monthKey) => ({
          month: monthKey,
          totalCents: trend.get(monthKey).totalCents,
          count: trend.get(monthKey).count
        }))
      };
    }
  };
}

export async function aggregateStatistics({ month, trendMonths }) {
  const accumulator = createStatisticsAccumulator({ month, trendMonths });
  const range = monthRange(month);
  const trendStart = monthRange(addMonths(month, -(trendMonths - 1))).start;

  await db.expenses
    .where("datetime")
    .between(trendStart, range.end, true, false)
    .each((record) => {
      accumulator.add(record);
    });

  return accumulator.finish();
}
