/**
 * confidence-badges.test.js
 * Tests for parseConfidenceBadges() — parses [confidence: X] markers from markdown.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { parseConfidenceBadges } = await import("../src/mcpAgent.js");

const VALID_VALUES = ["high", "medium", "low"];

describe("parseConfidenceBadges", () => {
  test("returns empty array for markdown with no badges", () => {
    const result = parseConfidenceBadges("## Matching Issues\n\n- [Some Issue](https://github.com/org/repo/issues/1)");
    assert.deepEqual(result, []);
  });

  test("parses a single high badge", () => {
    const md = "[confidence: high] [Add graph support](https://github.com/asyncapi/website/issues/1)";
    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, "high");
  });

  test("parses a single medium badge", () => {
    const md = "[confidence: medium] [Fix caching bug](https://github.com/zulip/zulip/issues/2)";
    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, "medium");
  });

  test("parses a single low badge", () => {
    const md = "[confidence: low] [Update docs](https://github.com/layer5io/meshery/issues/3)";
    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, "low");
  });

  test("parses multiple badges from a realistic markdown block", () => {
    const md = `
### Matching Issues

[confidence: high] [Add graph traversal](https://github.com/asyncapi/website/issues/10)
[confidence: medium] [DP helper fix](https://github.com/zulip/zulip/issues/20)
[confidence: low] [Update readme](https://github.com/oppia/oppia/issues/30)
    `.trim();

    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 3);
    assert.equal(result[0].confidence, "high");
    assert.equal(result[1].confidence, "medium");
    assert.equal(result[2].confidence, "low");
  });

  test("each confidence value is one of high | medium | low", () => {
    const md = `
[confidence: high] [Issue A](https://github.com/a/b/issues/1)
[confidence: medium] [Issue B](https://github.com/a/b/issues/2)
[confidence: low] [Issue C](https://github.com/a/b/issues/3)
    `.trim();

    const result = parseConfidenceBadges(md);
    for (const item of result) {
      assert.ok(
        VALID_VALUES.includes(item.confidence),
        `confidence must be one of ${VALID_VALUES.join(", ")}, got "${item.confidence}"`
      );
    }
  });

  test("is case-insensitive for the confidence value", () => {
    const md = "[confidence: HIGH] [Issue](https://github.com/a/b/issues/1)";
    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, "high");
  });

  test("tolerates extra whitespace around the value", () => {
    const md = "[confidence:   medium  ] [Issue](https://github.com/a/b/issues/1)";
    // The regex uses \s* after the colon, so this should still match
    const result = parseConfidenceBadges(md);
    assert.equal(result.length, 1);
  });
});
