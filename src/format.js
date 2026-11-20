import { getLocale } from "./i18n.js";
import { parseMonthKey } from "./dates.js";

const currencyFormatters = new Map();
const dateFormatters = new Map();
const dateTimeFormatters = new Map();
const monthFormatters = new Map();
const shortMonthFormatters = new Map();
const percentFormatters = new Map();
const numberFormatters = new Map();

function cachedFormatter(cache, locale, createFormatter) {
  if (!cache.has(locale)) {
    cache.set(locale, createFormatter(locale));
  }
  return cache.get(locale);
}

export function formatCurrency(amountCents, locale = getLocale()) {
  const formatter = cachedFormatter(
    currencyFormatters,
    locale,
    (activeLocale) =>
      new Intl.NumberFormat(activeLocale, {
        style: "currency",
        currency: "CNY",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
  );

  return formatter.format(Number(amountCents) / 100);
}

export function formatDate(epochMilliseconds, locale = getLocale()) {
  const date = new Date(epochMilliseconds);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = cachedFormatter(
    dateFormatters,
    locale,
    (activeLocale) =>
      new Intl.DateTimeFormat(activeLocale, {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
  );

  return formatter.format(date);
}

export function formatDateTime(epochMilliseconds, locale = getLocale()) {
  const date = new Date(epochMilliseconds);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = cachedFormatter(
    dateTimeFormatters,
    locale,
    (activeLocale) =>
      new Intl.DateTimeFormat(activeLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
  );

  return formatter.format(date);
}

export function formatMonthKey(monthKey, locale = getLocale()) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month - 1, 1, 12);
  const formatter = cachedFormatter(
    monthFormatters,
    locale,
    (activeLocale) =>
      new Intl.DateTimeFormat(activeLocale, {
        year: "numeric",
        month: "long"
      })
  );

  return formatter.format(date);
}

export function formatShortMonth(monthKey, locale = getLocale()) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month - 1, 1, 12);
  const formatter = cachedFormatter(
    shortMonthFormatters,
    locale,
    (activeLocale) =>
      new Intl.DateTimeFormat(activeLocale, {
        month: "short"
      })
  );

  return formatter.format(date);
}

export function formatPercent(ratio, locale = getLocale()) {
  const formatter = cachedFormatter(
    percentFormatters,
    locale,
    (activeLocale) =>
      new Intl.NumberFormat(activeLocale, {
        style: "percent",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      })
  );

  return formatter.format(Number(ratio) || 0);
}

export function formatNumber(value, locale = getLocale()) {
  const formatter = cachedFormatter(
    numberFormatters,
    locale,
    (activeLocale) => new Intl.NumberFormat(activeLocale)
  );
  return formatter.format(Number(value) || 0);
}
