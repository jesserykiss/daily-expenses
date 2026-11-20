function averageCents(category) {
  return category.count > 0 ? category.amountCents / category.count : 0;
}

function highestAverageCategory(categories) {
  return categories.reduce((best, category) => {
    if (!best) {
      return category;
    }
    const difference = averageCents(category) - averageCents(best);
    if (difference > 0) {
      return category;
    }
    if (difference === 0) {
      if (category.amountCents !== best.amountCents) {
        return category.amountCents > best.amountCents ? category : best;
      }
      if (category.count !== best.count) {
        return category.count > best.count ? category : best;
      }
    }
    return best;
  }, null);
}

export function buildInsights(statistics) {
  if (!statistics || statistics.totalCents <= 0 || statistics.count <= 0) {
    return [];
  }

  const candidates = [];
  const topCategory = statistics.categories[0] ?? null;

  if (topCategory) {
    candidates.push({
      key: "insight.topCategory",
      params: {
        category: topCategory.key,
        share: topCategory.share
      }
    });
  }

  if (statistics.previousTotalCents > 0) {
    if (statistics.totalCents === statistics.previousTotalCents) {
      candidates.push({ key: "insight.momSame", params: {} });
    } else if (statistics.totalCents > statistics.previousTotalCents) {
      candidates.push({
        key: "insight.momUp",
        params: {
          percent: Math.abs(statistics.changeRatio)
        }
      });
    } else {
      candidates.push({
        key: "insight.momDown",
        params: {
          percent: Math.abs(statistics.changeRatio)
        }
      });
    }
  } else {
    candidates.push({
      key: "insight.momFromZero",
      params: {
        amount: statistics.totalCents
      }
    });
  }

  if (statistics.categories.length >= 2) {
    const highestAverage = highestAverageCategory(statistics.categories);
    if (highestAverage && highestAverage.key !== topCategory?.key) {
      candidates.push({
        key: "insight.highestAverage",
        params: {
          category: highestAverage.key,
          average: averageCents(highestAverage)
        }
      });
    }
  }

  candidates.push({
    key: "insight.monthSummary",
    params: {
      count: statistics.count,
      amount: statistics.totalCents,
      average: statistics.averageCents
    }
  });

  const topPayment = statistics.payments[0] ?? null;
  if (statistics.payments.length >= 2 && topPayment?.share >= 0.5) {
    candidates.push({
      key: "insight.dominantPayment",
      params: {
        payment: topPayment.key,
        share: topPayment.share
      }
    });
  }

  return candidates.slice(0, 3);
}
