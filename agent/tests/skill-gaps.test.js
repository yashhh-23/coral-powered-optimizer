/**
 * skill-gaps.test.js
 * Verifies that buildInsightsPrompt() includes Skill Gaps instructions
 * and confidence marker instructions in the prompt it generates.
 *
 * No external LLM calls are made — only the prompt string is inspected.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Prevent MCP-related side effects
process.env.NODE_ENV = "test";

const { buildInsightsPrompt } = await import("../src/mcpAgent.js");

// Minimal mock data that resembles real result structures
const mockResult = [
  {
    type: "text",
    text: JSON.stringify([
      {
        title: "Add graph traversal support",
        html_url: "https://github.com/asyncapi/website/issues/10",
        owner: "asyncapi",
        repo: "website",
        labels: '["good first issue","graph"]'
      },
      {
        title: "Fix dynamic programming helper",
        html_url: "https://github.com/zulip/zulip/issues/20",
        owner: "zulip",
        repo: "zulip",
        labels: '["help wanted","dynamic-programming"]'
      }
    ])
  }
];

const mockArgs = {
  question: "Which GSoC orgs have issues matching my DP skills?",
  sql: "SELECT title, html_url FROM github.issues LIMIT 2",
  result: mockResult
};

describe("buildInsightsPrompt — Skill Gaps", () => {
  test("returns a non-empty string", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(typeof prompt === "string" && prompt.length > 0, "prompt should be a non-empty string");
  });

  test("includes the Skill Gaps section instruction", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.includes("Skill Gaps"),
      "prompt must instruct the LLM to produce a Skill Gaps section"
    );
  });

  test("Skill Gaps instruction mentions bullet format with solved count", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.includes("solved"),
      "prompt should instruct how many problems the user has solved"
    );
  });

  test("includes the user question in the prompt", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.includes(mockArgs.question),
      "prompt should embed the original user question"
    );
  });
});

describe("buildInsightsPrompt — Confidence Badges", () => {
  test("includes confidence marker instructions", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.includes("[confidence: high]"),
      "prompt must explain the [confidence: high] marker format"
    );
    assert.ok(
      prompt.includes("[confidence: medium]"),
      "prompt must explain the [confidence: medium] marker format"
    );
    assert.ok(
      prompt.includes("[confidence: low]"),
      "prompt must explain the [confidence: low] marker format"
    );
  });

  test("instructs the LLM to prepend confidence to each issue link", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.toLowerCase().includes("prepend"),
      "prompt should instruct to prepend confidence markers"
    );
  });
});

describe("buildInsightsPrompt — URL injection", () => {
  test("includes extracted issue URLs in the prompt", () => {
    const prompt = buildInsightsPrompt(mockArgs);
    assert.ok(
      prompt.includes("https://github.com/asyncapi/website/issues/10"),
      "first issue URL should be injected into the prompt"
    );
    assert.ok(
      prompt.includes("https://github.com/zulip/zulip/issues/20"),
      "second issue URL should be injected into the prompt"
    );
  });
});
