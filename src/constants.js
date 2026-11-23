export const DB_NAME = "daily-expenses";
export const DB_VERSION = 1;
export const EXPENSE_STORE = "expenses";

export const CATEGORIES = Object.freeze([
  "meals",
  "clothing",
  "rent",
  "household",
  "education",
  "medical",
  "travel",
  "social"
]);

export const PAYMENTS = Object.freeze(["cash", "wechat", "alipay", "credit"]);

export const PAGE_SIZE = 60;
export const DEFAULT_TREND_MONTHS = 6;
export const TREND_MONTH_OPTIONS = Object.freeze([6, 12]);
export const MAX_AMOUNT_CENTS = 9_999_999_999;
export const MAX_NOTE_LENGTH = 200;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export const EXPORT_FORMAT = "daily-expenses";
export const LOCALE_STORAGE_KEY = "dailyExpenses.locale";
export const STORAGE_NOTICE_SESSION_KEY = "dailyExpenses.storageNoticeDismissed";

export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"]);
export const DEFAULT_LOCALE = "zh-CN";

export const APP_VERSION = "1.0.0";
