import { describe, it, expect } from "vitest";
import { parseDiff } from "../src/diff";
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from "../src/review";

const small = parseDiff(
  ["diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1,1 +1,2 @@", " keep", "+const x = 1;"].join("\n")
);

describe("buildReviewPrompt", () => {
  it("prints the new line number and sign for each added line", () => {
    const prompt = buildReviewPrompt(small, []);
    expect(prompt).toContain("### a.ts (modified)");
    expect(prompt).toContain("   2 + const x = 1;");
  });

  it("wraps the diff and snippets in tags so they are treated as data", () => {
    const prompt = buildReviewPrompt(small, []);
    expect(prompt).toContain("<diff>");
    expect(prompt).toContain("</diff>");
    expect(prompt).toContain("<similar_snippets>");
    expect(REVIEW_SYSTEM_PROMPT).toContain("untrusted data");
  });

  it("says (none) when there are no similar snippets", () => {
    expect(buildReviewPrompt(small, [])).toContain("(none)");
  });

  it("includes similar snippets but cuts very long ones", () => {
    const prompt = buildReviewPrompt(small, [
      { title: "auth helper", language: "typescript", code: "a".repeat(5000) },
    ]);
    expect(prompt).toContain("auth helper");
    expect(prompt).not.toContain("a".repeat(1501));
  });

  it("truncates a huge diff", () => {
    const big = parseDiff(
      [
        "diff --git a/big.ts b/big.ts",
        "--- a/big.ts",
        "+++ b/big.ts",
        "@@ -0,0 +1,2000 @@",
        ...Array.from({ length: 2000 }, (_, i) => `+const v${i} = "${"x".repeat(30)}";`),
      ].join("\n")
    );
    const prompt = buildReviewPrompt(big, []);
    expect(prompt).toContain("[diff truncated");
    expect(prompt.length).toBeLessThan(26000);
  });
});