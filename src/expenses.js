import {
  CATEGORIES,
  EXPENSE_STORE,
  MAX_AMOUNT_CENTS,
  MAX_NOTE_LENGTH,
  PAGE_SIZE,
  PAYMENTS
} from "./constants.js";
import { db } from "./db.js";
import { monthRange } from "./dates.js";

export class ExpenseValidationError extends Error {
  constructor(fields) {
    super("Invalid expense data");
    this.name = "ExpenseValidationError";
    this.fields = fields;
  }
}

function countCharacters(value) {
  return Array.from(value).length;
}

export function validateExpenseFields(input) {
  const fields = {};
  const datetime = Number(input?.datetime);
  const amountCents = Number(input?.amountCents);
  const note = String(input?.note ?? "").trim();

  if (!Number.isSafeInteger(datetime) || datetime <= 0 || Number.isNaN(new Date(datetime).getTime())) {
    fields.datetime = "form.dateInvalid";
  }
  if (!CATEGORIES.includes(input?.category)) {
    fields.category = "form.categoryRequired";
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    fields.amountCents = "form.amountPositive";
  } else if (amountCents > MAX_AMOUNT_CENTS) {
    fields.amountCents = "form.amountTooLarge";
  }
  if (countCharacters(note) > MAX_NOTE_LENGTH) {
    fields.note = "form.noteTooLong";
  }
  if (!PAYMENTS.includes(input?.payment)) {
    fields.payment = "form.paymentRequired";
  }

  return {
    ok: Object.keys(fields).length === 0,
    fields,
    value: {
      datetime,
      category: input?.category,
      amountCents,
      note,
      payment: input?.payment
    }
  };
}

function assertValidExpense(input) {
  const validation = validateExpenseFields(input);
  if (!validation.ok) {
    throw new ExpenseValidationError(validation.fields);
  }
  return validation.value;
}

function assertCategory(category) {
  if (category !== null && category !== undefined && category !== "" && !CATEGORIES.includes(category)) {
    throw new ExpenseValidationError({ category: "form.categoryRequired" });
  }
}

function createCollection(month, category) {
  const { start, end } = monthRange(month);
  if (category) {
    return db.expenses
      .where("[category+datetime]")
      .between([category, start], [category, end], true, false)
      .reverse();
  }
  return db.expenses.where("datetime").between(start, end, true, false).reverse();
}

export async function createExpense(input) {
  const value = assertValidExpense(input);
  const now = Date.now();
  return db.expenses.add({
    ...value,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateExpense(id, input) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new ExpenseValidationError({ id: "error.unexpected" });
  }

  const value = assertValidExpense(input);
  const existing = await db.expenses.get(numericId);
  if (!existing) {
    throw new Error("ExpenseNotFound");
  }

  await db.expenses.update(numericId, {
    ...value,
    createdAt: existing.createdAt,
    updatedAt: Date.now()
  });
  return numericId;
}

export async function getExpense(id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return null;
  }
  return (await db.expenses.get(numericId)) ?? null;
}

export async function deleteExpense(id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new ExpenseValidationError({ id: "error.unexpected" });
  }
  await db.expenses.delete(numericId);
}

export async function queryExpenses({ month, category = "", page = 1, pageSize = PAGE_SIZE }) {
  assertCategory(category);
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || PAGE_SIZE, 200));

  return db.transaction("r", db.expenses, async () => {
    const collection = createCollection(month, category);
    const total = await collection.count();
    const pageCount = Math.max(1, Math.ceil(total / safePageSize));
    const effectivePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
    const items = await collection
      .offset((effectivePage - 1) * safePageSize)
      .limit(safePageSize)
      .toArray();

    return {
      items,
      total,
      page: effectivePage,
      pageCount,
      pageSize: safePageSize
    };
  });
}

export async function getMonthBounds() {
  const [first, last] = await Promise.all([
    db.expenses.orderBy("datetime").first(),
    db.expenses.orderBy("datetime").last()
  ]);

  return first && last
    ? {
        firstDatetime: first.datetime,
        lastDatetime: last.datetime
      }
    : null;
}

export async function getExpenseCount() {
  return db.table(EXPENSE_STORE).count();
}
