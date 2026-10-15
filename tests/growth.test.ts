import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarText, canonicalRoomUrl, showPhase, validateGrowthWrite, type Show } from "../src/lib/growth";
const roomId = `0x${"1".repeat(40)}`, id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = Date.parse("2026-10-14T12:00:00Z");
test("scheduling requires a timezone, bounded future time, valid id/revision and bounded text", () => {
  const request = { roomId, action:"schedule", payload:{id,revision:0,title:"Next show",description:"",startsAt:"2026-10-15T08:00:00-04:00"} };
  assert.equal(validateGrowthWrite(request,now)?.payload.startsAt,"2026-10-15T12:00:00.000Z");
  for (const change of [{startsAt:"2026-10-15T12:00"},{startsAt:"2026-10-13T12:00:00Z"},{startsAt:"2027-10-15T12:00:00Z"},{title:"x".repeat(101)},{revision:-1},{id:"fake"}]) assert.equal(validateGrowthWrite({...request,payload:{...request.payload,...change}},now),null);
  assert.equal(validateGrowthWrite(null),null);
});
test("growth validation discards actor/owner overrides and forbids external image sources", () => {
  const body = validateGrowthWrite({roomId,action:"profile",wallet:"evil",payload:{displayName:"Creator",bio:"Hello",avatar:"H",creator:"evil"}});
  assert.deepEqual(body?.payload,{displayName:"Creator",bio:"Hello",avatar:"H"});
  assert.equal(validateGrowthWrite({roomId,action:"profile",payload:{displayName:"Creator",bio:"",avatar:"https://tracker.test/pixel"}}),null);
});
test("elapsed scheduled times do not manufacture live or ended broadcasts", () => {
  const show:Show = {id,title:"Show",description:"",revision:1,status:"scheduled",startsAt:"2026-10-14T11:00:00Z"};
  assert.equal(showPhase(show,false,now),"awaiting-creator");
  assert.equal(showPhase(show,true,now),"live");
  assert.equal(showPhase(null,false,now),"offline");
  assert.equal(showPhase({...show,status:"canceled"},false,now),"canceled");
});
test("calendar carries UTC time and escapes injected fields rather than adding calendar properties", () => {
  const show:Show={id,title:"Hello\nATTENDEE:bad",description:"one,two;three",revision:1,status:"scheduled",startsAt:"2026-10-15T12:00:00Z"};
  const text = calendarText(show,canonicalRoomUrl(roomId));
  assert.match(text,/DTSTART:20261015T120000Z/);
  assert.match(text,/SUMMARY:Hello\\nATTENDEE:bad/);
  assert.doesNotMatch(text,/\r\nATTENDEE:/);
  assert.equal(canonicalRoomUrl(roomId),`https://hypr-pons.vercel.app/room/${roomId}`);
  assert.throws(()=>canonicalRoomUrl("bad"));
});
