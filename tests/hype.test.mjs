import test from "node:test";
import assert from "node:assert/strict";

test("HYPE documentation defines a social-first weighted model", async () => {
  const fs = await import("node:fs/promises");
  const text = await fs.readFile("docs/HYPE_SCORING.md", "utf8");
  assert.match(text, /unique viewers/i);
  assert.match(text, /market cap/i);
  assert.match(text, /anti-spam/i);
});
