"use client";

import React, { useEffect, useState } from "react";
import { useMediaDeviceSelect, useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { LiveIcon, type LiveIconName } from "./live-icons";

export type HostPanel = "guests" | "record" | "devices" | null;

function DeckToggle({ source, on, off, label }: { source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare; on: LiveIconName; off: LiveIconName; label: string }) {
  const { enabled, pending, toggle } = useTrackToggle({ source, captureOptions: source === Track.Source.ScreenShare ? { audio: true } : undefined });
  const screen = source === Track.Source.ScreenShare;
  const stateLabel = screen ? (enabled ? "Stop sharing your screen" : "Share your screen") : `${enabled ? "Turn off" : "Turn on"} ${label.toLowerCase()}`;
  return <button type="button" className={`deck-button${screen ? " is-screen" : ""}${enabled ? (screen ? " is-active" : "") : screen ? "" : " is-off"}`} aria-pressed={enabled} aria-label={stateLabel} title={stateLabel} disabled={pending} onClick={() => void toggle()}>
    <LiveIcon name={enabled || screen ? on : off} /><span className="deck-label">{label}</span>
  </button>;
}

/** The creator's controls while live: devices, screen, guests, replay, end. */
export function HostLiveDeck({ panel, onPanel, requests, recording, onEnd }: { panel: HostPanel; onPanel: (next: HostPanel) => void; requests: number; recording: boolean; onEnd: () => void }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function"); }, []);
  const toggle = (next: Exclude<HostPanel, null>) => onPanel(panel === next ? null : next);
  return <div className="host-deck" role="toolbar" aria-label="Broadcast controls">
    <div className="host-deck-group">
      <DeckToggle source={Track.Source.Microphone} on="mic" off="micOff" label="Mic" />
      <DeckToggle source={Track.Source.Camera} on="cam" off="camOff" label="Camera" />
      {canShare && <DeckToggle source={Track.Source.ScreenShare} on="screen" off="screen" label="Screen" />}
      <button type="button" className="deck-button" aria-expanded={panel === "devices"} aria-label="Choose camera and microphone" title="Choose camera and microphone" onClick={() => toggle("devices")}><LiveIcon name="gear" /><span className="deck-label">Devices</span></button>
    </div>
    <div className="host-deck-group">
      <button type="button" className={`deck-button${panel === "guests" ? " is-active" : ""}`} aria-expanded={panel === "guests"} aria-label={requests ? `Guests, ${requests} waiting` : "Guests"} onClick={() => toggle("guests")}><LiveIcon name="guests" /><span className="deck-label">Guests</span>{requests > 0 && <span className="deck-badge">{requests}</span>}</button>
      <button type="button" className={`deck-button${recording ? " is-recording" : panel === "record" ? " is-active" : ""}`} aria-expanded={panel === "record"} aria-label={recording ? "Replay recording" : "Record a replay"} onClick={() => toggle("record")}><LiveIcon name="rec" /><span className="deck-label">{recording ? "Rec" : "Replay"}</span></button>
      <button type="button" className="deck-end" onClick={onEnd}>End broadcast</button>
    </div>
  </div>;
}

function DeviceSelect({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  const choices = devices.filter(device => device.deviceId);
  if (!choices.length) return null;
  return <label>{label}<select value={activeDeviceId} onChange={event => void setActiveMediaDevice(event.target.value).catch(() => undefined)}>
    {choices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}
  </select></label>;
}

export function HostDevicePanel() {
  return <section className="host-panel host-devices" aria-label="Choose devices">
    <DeviceSelect kind="videoinput" label="Camera" />
    <DeviceSelect kind="audioinput" label="Microphone" />
    <p>Switching keeps you live. Viewers see the change in a second or two.</p>
  </section>;
}
