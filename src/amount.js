import { MAX_AMOUNT_CENTS } from "./constants.js";

export const AMOUNT_ERROR = Object.freeze({
  EMPTY: "form.amountInvalid",
  INVALID: "form.amountInvalid",
  ZERO: "form.amountPositive",
  TOO_LARGE: "form.amountTooLarge"
});

export function normalizeAmountInput(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(",", ".");
}

export function parseAmountToCents(value) {
  const normalized = normalizeAmountInput(value);

  if (!normalized) {
    return { ok: false, errorKey: AMOUNT_ERROR.EMPTY };
  }

  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) {
    return { ok: false, errorKey: AMOUNT_ERROR.INVALID };
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const fraction = fractionPart.padEnd(2, "0");
  const whole = wholePart || "0";
  const amountCents = Number(whole) * 100 + Number(fraction);

  if (!Number.isSafeInteger(amountCents)) {
    return { ok: false, errorKey: AMOUNT_ERROR.TOO_LARGE };
  }

  if (amountCents <= 0) {
    return { ok: false, errorKey: AMOUNT_ERROR.ZERO };
  }

  if (amountCents > MAX_AMOUNT_CENTS) {
    return { ok: false, errorKey: AMOUNT_ERROR.TOO_LARGE };
  }

  return { ok: true, amountCents };
}

export function centsToAmountInput(amountCents) {
  const safeCents = Number(amountCents);
  if (!Number.isSafeInteger(safeCents) || safeCents < 0) {
    return "";
  }

  return (safeCents / 100).toFixed(2);
}
