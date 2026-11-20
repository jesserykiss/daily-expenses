import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CATEGORIES, PAYMENTS } from "../src/constants.js";

const localePaths = [
  new URL("../locales/zh-CN.json", import.meta.url),
  new URL("../locales/en-US.json", import.meta.url)
];

async function readLocale(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
    .map((match) => match[1])
    .sort();
}

test("locale files expose the same keys and placeholders", async () => {
  const [zhCN, enUS] = await Promise.all(localePaths.map(readLocale));
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(enUS).sort());

  for (const key of Object.keys(zhCN)) {
    assert.equal(typeof zhCN[key], "string", `${key} must be a string in zh-CN`);
    assert.equal(typeof enUS[key], "string", `${key} must be a string in en-US`);
    assert.ok(zhCN[key].trim(), `${key} must not be empty in zh-CN`);
    assert.ok(enUS[key].trim(), `${key} must not be empty in en-US`);
    assert.deepEqual(placeholders(enUS[key]), placeholders(zhCN[key]), `placeholder mismatch for ${key}`);
  }
});

test("all enum keys have translations in both locales", async () => {
  const [zhCN, enUS] = await Promise.all(localePaths.map(readLocale));
  for (const locale of [zhCN, enUS]) {
    for (const category of CATEGORIES) {
      assert.ok(locale[`category.${category}`], `missing category.${category}`);
    }
    for (const payment of PAYMENTS) {
      assert.ok(locale[`payment.${payment}`], `missing payment.${payment}`);
    }
  }
});
