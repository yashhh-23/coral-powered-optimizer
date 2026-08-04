/**
 * save-matches.test.js
 * Tests for POST /api/save-match, GET /api/saved-matches, DELETE /api/saved-matches/:id
 *
 * Spins up the Express app on a random port without calling connectCoral() or any MCP.
 * All Coral/MCP imports are mocked via environment flag so server.js skips them.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Prevent the module-level startup side-effects (writeDotEnv, writeCoralSecrets, syncFileToWsl)
// from throwing on CI by setting env vars before importing.
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PORT = "0"; // 0 = OS picks a free port

// We mock the heavy MCP module so the test doesn't try to spawn coral
const { app } = await import("../src/server.js");

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) => server.close(resolve));
});

async function request(method, path, body) {
  const url = new URL(path, baseUrl);
  const opts = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url.toString(), opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe("POST /api/save-match", () => {
  test("creates a match and returns ok + id", async () => {
    const { status, data } = await request("POST", "/api/save-match", {
      issueUrl: "https://github.com/asyncapi/website/issues/1",
      pitch: "Great match for graph skills",
      org: "asyncapi",
      tags: ["graphs", "DP"]
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.ok(typeof data.id === "string" && data.id.length > 0, "id should be a non-empty string");
  });

  test("returns 400 when issueUrl is missing", async () => {
    const { status } = await request("POST", "/api/save-match", {
      org: "asyncapi"
    });
    assert.equal(status, 400);
  });

  test("returns 400 when org is missing", async () => {
    const { status } = await request("POST", "/api/save-match", {
      issueUrl: "https://github.com/asyncapi/website/issues/1"
    });
    assert.equal(status, 400);
  });
});

describe("GET /api/saved-matches", () => {
  test("returns an array containing saved matches", async () => {
    // Save one first
    const { data: saved } = await request("POST", "/api/save-match", {
      issueUrl: "https://github.com/zulip/zulip/issues/42",
      org: "zulip",
      tags: ["python"]
    });

    const { status, data } = await request("GET", "/api/saved-matches");
    assert.equal(status, 200);
    assert.ok(Array.isArray(data), "response should be an array");
    const found = data.find((m) => m.id === saved.id);
    assert.ok(found, "saved match should appear in the list");
    assert.equal(found.org, "zulip");
    assert.deepEqual(found.tags, ["python"]);
  });
});

describe("DELETE /api/saved-matches/:id", () => {
  test("removes a match and confirms it is gone", async () => {
    const { data: saved } = await request("POST", "/api/save-match", {
      issueUrl: "https://github.com/layer5io/meshery/issues/7",
      org: "layer5io",
      tags: []
    });
    const id = saved.id;

    // Delete it
    const { status: deleteStatus, data: deleteData } = await request(
      "DELETE",
      `/api/saved-matches/${id}`
    );
    assert.equal(deleteStatus, 200);
    assert.equal(deleteData.ok, true);

    // Confirm it is gone
    const { data: list } = await request("GET", "/api/saved-matches");
    const gone = list.find((m) => m.id === id);
    assert.equal(gone, undefined, "deleted match should not appear in list");
  });

  test("returns 404 for non-existent id", async () => {
    const { status } = await request("DELETE", "/api/saved-matches/doesnotexist999");
    assert.equal(status, 404);
  });
});
