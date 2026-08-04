/**
 * org-presets.validation.test.js
 * Validates the structure of agent/org-presets.json.
 * Each preset must be an array of non-empty strings.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const presetsPath = resolve(__dirname, "../org-presets.json");

let presets;
try {
  presets = JSON.parse(readFileSync(presetsPath, "utf8"));
} catch (e) {
  throw new Error(`Failed to load org-presets.json: ${e.message}`);
}

describe("org-presets.json structure", () => {
  test("file parses as a plain object", () => {
    assert.ok(presets !== null && typeof presets === "object" && !Array.isArray(presets));
  });

  test("has at least 3 presets", () => {
    const keys = Object.keys(presets);
    assert.ok(keys.length >= 3, `Expected at least 3 presets, found ${keys.length}`);
  });

  test("each preset key maps to a non-empty array", () => {
    for (const [key, value] of Object.entries(presets)) {
      assert.ok(Array.isArray(value), `Preset "${key}" should be an array`);
      assert.ok(value.length > 0, `Preset "${key}" should not be empty`);
    }
  });

  test("each org name is a non-empty string", () => {
    for (const [key, orgs] of Object.entries(presets)) {
      for (const org of orgs) {
        assert.ok(
          typeof org === "string" && org.trim().length > 0,
          `Preset "${key}" contains an invalid org name: ${JSON.stringify(org)}`
        );
      }
    }
  });

  test("no duplicate org names within a single preset", () => {
    for (const [key, orgs] of Object.entries(presets)) {
      const unique = new Set(orgs.map((o) => o.toLowerCase()));
      assert.equal(
        unique.size,
        orgs.length,
        `Preset "${key}" has duplicate org names`
      );
    }
  });

  test("expected presets are present", () => {
    const keys = Object.keys(presets);
    const expected = ["GSoC Popular", "CNCF Orgs", "ML Orgs", "Web Infra"];
    for (const name of expected) {
      assert.ok(keys.includes(name), `Expected preset "${name}" to exist`);
    }
  });
});
