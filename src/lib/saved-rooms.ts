"use client";
import { ADDRESS } from "./growth";
export const SAVED_ROOMS_EVENT="hypr-saved-rooms";
const key="hypr-saved-rooms-v1";
export function savedRooms():string[] {
  if(typeof window==="undefined") return [];
  try { const parsed:unknown=JSON.parse(window.localStorage.getItem(key)||"[]"); return Array.isArray(parsed)?[...new Set(parsed.filter((item):item is string=>typeof item==="string"&&ADDRESS.test(item)).map(item=>item.toLowerCase()))].slice(0,100):[]; } catch {return [];}
}
export function saveRoomOnDevice(address:string,save:boolean) {
  if(!ADDRESS.test(address)) throw new Error("Invalid room");
  const current=savedRooms().filter(item=>item!==address.toLowerCase());
  if(save&&current.length>=100) throw new Error("This device has 100 saved rooms. Remove one first.");
  window.localStorage.setItem(key,JSON.stringify(save?[address.toLowerCase(),...current]:current));
  window.dispatchEvent(new Event(SAVED_ROOMS_EVENT));
}
