import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/live/token/route";

test("streaming tokens reject invalid roles, sample rooms, and unindexed addresses", async () => {
  const configured = { LIVEKIT_URL: "wss://test.livekit.cloud", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret", PONS_INDEXER_MODE: "fixture", HYPR_FACTORY_ADDRESS: "" };
  const previous = Object.fromEntries(Object.keys(configured).map(key => [key, process.env[key]]));
  Object.assign(process.env, configured);
  try {
    for (const [body, status] of [
      [{ roomId: "0x8B7f0bC4B22fE4e3cA91E0C4b3fA1c7D5E6f8A90", role: "admin" }, 400],
      [{ roomId: "0x8B7f0bC4B22fE4e3cA91E0C4b3fA1c7D5E6f8A90", role: "viewer" }, 404],
      [{ roomId: "0x0000000000000000000000000000000000000001", role: "viewer" }, 404],
    ] as const) {
      const response = await POST(new Request("https://hypr.test/api/live/token", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, status);
      assert.equal("token" in await response.json(), false);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
