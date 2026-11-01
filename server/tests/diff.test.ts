import { describe, it, expect } from "vitest";
import { parseDiff } from "../src/diff";

const join = (...lines: string[]) => lines.join("\n");

const SAMPLE = join(
  "diff --git a/src/auth.ts b/src/auth.ts",
  "index 83db48f..bf2a3c1 100644",
  "--- a/src/auth.ts",
  "+++ b/src/auth.ts",
  "@@ -1,6 +1,7 @@",
  ' import jwt from "jsonwebtoken";',
  '-const SECRET = "hardcoded";',
  "+const SECRET = process.env.JWT_SECRET!;",
  '+const EXPIRES = "7d";',
  " ",
  " export function sign(id: string) {",
  "-  return jwt.sign({ id }, SECRET);",
  "+  return jwt.sign({ id }, SECRET, { expiresIn: EXPIRES });",
  " }",
  "diff --git a/src/utils.ts b/src/utils.ts",
  "new file mode 100644",
  "index 0000000..e69de29",
  "--- /dev/null",
  "+++ b/src/utils.ts",
  "@@ -0,0 +1,2 @@",
  "+export const add = (a: number, b: number) => a + b;",
  "+export const sub = (a: number, b: number) => a - b;"
);

describe("parseDiff", () => {
  it("parses files, statuses and counts", () => {
    const files = parseDiff(SAMPLE);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "src/auth.ts", status: "modified", additions: 3, deletions: 2 });
    expect(files[1]).toMatchObject({ path: "src/utils.ts", status: "added", additions: 2, deletions: 0 });
  });

  it("tracks old and new line numbers", () => {
    const lines = parseDiff(SAMPLE)[0].hunks[0].lines;
    expect(lines[0]).toMatchObject({ type: "context", oldLine: 1, newLine: 1 });
    expect(lines[1]).toMatchObject({ type: "del", oldLine: 2, newLine: null });
    expect(lines[2]).toMatchObject({ type: "add", oldLine: null, newLine: 2 });
    expect(lines[3]).toMatchObject({ type: "add", oldLine: null, newLine: 3 });
  });

  it("numbers lines of a new file from 1", () => {
    const lines = parseDiff(SAMPLE)[1].hunks[0].lines;
    expect(lines.map((l) => l.newLine)).toEqual([1, 2]);
  });

  it("does not mistake a removed line that starts with -- for a file header", () => {
    const diff = join(
      "diff --git a/q.sql b/q.sql",
      "--- a/q.sql",
      "+++ b/q.sql",
      "@@ -1,2 +1,1 @@",
      " SELECT 1;",
      "--- sql comment"
    );
    const file = parseDiff(diff)[0];
    expect(file.deletions).toBe(1);
    expect(file.hunks[0].lines[1]).toMatchObject({ type: "del", content: "-- sql comment" });
  });

  it("handles hunk headers without counts", () => {
    const diff = join(
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -5 +5 @@",
      "-old",
      "+new"
    );
    const lines = parseDiff(diff)[0].hunks[0].lines;
    expect(lines[0]).toMatchObject({ type: "del", oldLine: 5 });
    expect(lines[1]).toMatchObject({ type: "add", newLine: 5 });
  });

  it("ignores the 'No newline at end of file' marker", () => {
    const diff = join(
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-a",
      "\\ No newline at end of file",
      "+b"
    );
    const lines = parseDiff(diff)[0].hunks[0].lines;
    expect(lines).toHaveLength(2);
  });

  it("works with Windows line endings", () => {
    const files = parseDiff(SAMPLE.replace(/\n/g, "\r\n"));
    expect(files[0].additions).toBe(3);
    expect(files[0].hunks[0].lines[2].content).toBe("const SECRET = process.env.JWT_SECRET!;");
  });

  it("returns nothing for text that is not a diff", () => {
    expect(parseDiff("hello world")).toEqual([]);
    expect(parseDiff("")).toEqual([]);
  });
});