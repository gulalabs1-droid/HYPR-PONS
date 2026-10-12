import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConnectedRoom } from "../src/components/native-live-room";

test("connected host and viewer controls render inside the LiveKit room provider", async () => {
  for (const role of ["host", "viewer"] as const) {
      let renderer: ReactTestRenderer | undefined;
      await act(async () => {
        renderer = create(createElement(ConnectedRoom, {
          session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role },
          connect: false,
          onLeave() {},
          onError() {},
        }));
      });
      const controls = renderer!.root.findAllByType("button");
      assert.ok(controls.some(control => control.props.children === (role === "host" ? "End live" : "Leave live")));
      await act(async () => renderer!.unmount());
  }
});
