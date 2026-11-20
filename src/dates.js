const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const LOCAL_INPUT_PATTERN = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

export function monthKeyFromDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function currentMonthKey(now = new Date()) {
  return monthKeyFromDate(now);
}

export function parseMonthKey(monthKey) {
  const match = MONTH_KEY_PATTERN.exec(String(monthKey));
  if (!match) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  return { year, month };
}

export function monthRange(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  return {
    start: start.getTime(),
    end: end.getTime()
  };
}

export function addMonths(monthKey, delta) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(year, month - 1 + delta, 1, 12);
  return monthKeyFromDate(date);
}

export function trendMonthKeys(endMonthKey, count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Trend month count must be a positive integer");
  }

  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    months.push(addMonths(endMonthKey, -offset));
  }
  return months;
}

export function compareMonthKeys(left, right) {
  return String(left).localeCompare(String(right));
}

export function monthKeysBetween(startMonthKey, endMonthKey) {
  if (compareMonthKeys(startMonthKey, endMonthKey) > 0) {
    return [];
  }

  const months = [];
  let cursor = startMonthKey;
  while (compareMonthKeys(cursor, endMonthKey) <= 0) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function toLocalDateTimeInput(epochMilliseconds) {
  const date = new Date(epochMilliseconds);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join("T");
}

export function epochFromLocalDateTimeInput(value) {
  const match = LOCAL_INPUT_PATTERN.exec(String(value ?? ""));
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date.getTime();
}
