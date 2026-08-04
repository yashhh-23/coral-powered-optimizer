/**
 * share-result.test.js
 * Tests for POST /api/share, GET /api/share/:id
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PORT = "0";

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

describe("POST /api/share", () => {
  test("creates a share entry and returns an id", async () => {
    const { status, data } = await request("POST", "/api/share", {
      query: "Find DP issues in zulip",
      results: [{ title: "Issue 1", html_url: "https://github.com/zulip/zulip/issues/1" }],
      pitch: "Your DP skills match several zulip issues."
    });
    assert.equal(status, 200);
    assert.ok(typeof data.id === "string" && data.id.length > 0, "id should be a non-empty string");
  });

  test("returns 400 when query is missing", async () => {
    const { status } = await request("POST", "/api/share", {
      results: [],
      pitch: "some pitch"
    });
    assert.equal(status, 400);
  });
});

describe("GET /api/share/:id", () => {
  test("returns stored data for a valid id", async () => {
    const payload = {
      query: "Find graph issues in asyncapi",
      results: [{ title: "Graph Issue", html_url: "https://github.com/asyncapi/website/issues/5" }],
      pitch: "Strong graph skills align with asyncapi issues."
    };
    const { data: created } = await request("POST", "/api/share", payload);
    const id = created.id;

    const { status, data } = await request("GET", `/api/share/${id}`);
    assert.equal(status, 200);
    assert.equal(data.id, id);
    assert.equal(data.query, payload.query);
    assert.equal(data.pitch, payload.pitch);
    assert.ok(Array.isArray(data.results), "results should be an array");
    assert.ok(typeof data.createdAt === "string", "createdAt should be set");
  });

  test("returns 404 for an invalid id", async () => {
    const { status } = await request("GET", "/api/share/invalid-id-that-does-not-exist");
    assert.equal(status, 404);
  });
});
