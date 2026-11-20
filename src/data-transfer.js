import {
  CATEGORIES,
  DB_VERSION,
  EXPORT_FORMAT,
  MAX_AMOUNT_CENTS,
  MAX_NOTE_LENGTH,
  PAYMENTS
} from "./constants.js";
import { db } from "./db.js";
import { validateExpenseFields } from "./expenses.js";

export class DataTransferError extends Error {
  constructor(code, params = {}, options = {}) {
    super(code, options);
    this.name = "DataTransferError";
    this.code = code;
    this.params = params;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeNote(value) {
  return String(value).normalize("NFC").trim();
}

function isAuditTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeRecord(record, index) {
  if (
    !isPlainObject(record) ||
    typeof record.datetime !== "number" ||
    typeof record.category !== "string" ||
    typeof record.amountCents !== "number" ||
    typeof record.note !== "string" ||
    typeof record.payment !== "string"
  ) {
    throw new DataTransferError("error.invalidRecord", { index });
  }

  const note = normalizeNote(record.note);
  if (Array.from(note).length > MAX_NOTE_LENGTH) {
    throw new DataTransferError("error.invalidRecord", { index });
  }

  if (
    (record.createdAt !== undefined && !isAuditTimestamp(record.createdAt)) ||
    (record.updatedAt !== undefined && !isAuditTimestamp(record.updatedAt))
  ) {
    throw new DataTransferError("error.invalidRecord", { index });
  }

  const validation = validateExpenseFields({
    datetime: record.datetime,
    category: record.category,
    amountCents: record.amountCents,
    note,
    payment: record.payment
  });
  if (
    !validation.ok ||
    !CATEGORIES.includes(record.category) ||
    !PAYMENTS.includes(record.payment) ||
    !Number.isSafeInteger(record.amountCents) ||
    record.amountCents <= 0 ||
    record.amountCents > MAX_AMOUNT_CENTS
  ) {
    throw new DataTransferError("error.invalidRecord", { index });
  }

  return {
    datetime: record.datetime,
    category: record.category,
    amountCents: record.amountCents,
    note,
    payment: record.payment,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function validateImportEnvelope(input) {
  if (!isPlainObject(input)) {
    throw new DataTransferError("error.invalidEnvelope");
  }
  if (input.format !== EXPORT_FORMAT) {
    throw new DataTransferError("error.invalidEnvelope");
  }
  if (input.schemaVersion !== DB_VERSION) {
    throw new DataTransferError("error.unsupportedSchema", {
      version: String(input.schemaVersion ?? "")
    });
  }
  if (
    typeof input.exportedAt !== "string" ||
    Number.isNaN(Date.parse(input.exportedAt))
  ) {
    throw new DataTransferError("error.invalidEnvelope");
  }
  if (!Array.isArray(input.records)) {
    throw new DataTransferError("error.invalidEnvelope");
  }

  return {
    format: EXPORT_FORMAT,
    schemaVersion: DB_VERSION,
    exportedAt: input.exportedAt,
    records: input.records.map((record, index) => normalizeRecord(record, index + 1))
  };
}

export function parseImportText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DataTransferError("error.invalidJson", {}, { cause: error });
  }
  return validateImportEnvelope(data);
}

export function buildFingerprint(record) {
  return [
    record.datetime,
    record.category,
    record.amountCents,
    record.payment,
    normalizeNote(record.note)
  ].join("\u0000");
}

export async function exportAllExpenses() {
  const records = await db.expenses.orderBy("datetime").toArray();
  return {
    format: EXPORT_FORMAT,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    records
  };
}

export function serializeExport(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function createExportFilename(date = new Date()) {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `daily-expenses-${datePart}-${timePart}.json`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveExportFile({ text, filename, title }) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const file = new File([blob], filename, { type: "application/json" });
  let canShareFiles = false;
  try {
    canShareFiles =
      typeof globalThis.navigator?.canShare === "function" &&
      typeof globalThis.navigator?.share === "function" &&
      globalThis.navigator.canShare({ files: [file] });
  } catch {
    canShareFiles = false;
  }

  if (canShareFiles) {
    try {
      await globalThis.navigator.share({ title, files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  triggerDownload(blob, filename);
  return "downloaded";
}

export async function importExpenseData(input) {
  const envelope = validateImportEnvelope(input);
  const now = Date.now();

  try {
    return await db.transaction("rw", db.expenses, async () => {
      const existingRecords = await db.expenses.toArray();
      const fingerprints = new Set(existingRecords.map(buildFingerprint));
      const recordsToAdd = [];
      let skipped = 0;

      for (const record of envelope.records) {
        const fingerprint = buildFingerprint(record);
        if (fingerprints.has(fingerprint)) {
          skipped += 1;
          continue;
        }
        fingerprints.add(fingerprint);
        recordsToAdd.push({
          ...record,
          createdAt: record.createdAt ?? now,
          updatedAt: record.updatedAt ?? now
        });
      }

      if (recordsToAdd.length > 0) {
        await db.expenses.bulkAdd(recordsToAdd);
      }

      return {
        inserted: recordsToAdd.length,
        skipped
      };
    });
  } catch (error) {
    if (error instanceof DataTransferError) {
      throw error;
    }
    const code =
      error?.name === "QuotaExceededError" ||
      /quota|space/i.test(String(error?.message))
        ? "error.quota"
        : "error.importRollback";
    throw new DataTransferError(code, {}, { cause: error });
  }
}

export async function clearAllExpenses() {
  await db.transaction("rw", db.expenses, async () => {
    await db.expenses.clear();
  });
}
