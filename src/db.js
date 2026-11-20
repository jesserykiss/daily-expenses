import Dexie from "../vendor/dexie-4.0.11.mjs";
import { DB_NAME, DB_VERSION, EXPENSE_STORE } from "./constants.js";

export const db = new Dexie(DB_NAME);

// Never edit this version block. Add a new version and migration for schema changes.
db.version(DB_VERSION).stores({
  [EXPENSE_STORE]: "++id, datetime, category, payment, [category+datetime]"
});

db.on("versionchange", () => {
  db.close();
});

export async function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    throw new Error("IndexedDBUnavailable");
  }

  try {
    await db.open();
    return db;
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
}
