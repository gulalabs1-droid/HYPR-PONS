"use client";
import React,{useEffect,useState} from "react";
import { SAVED_ROOMS_EVENT, savedRooms, saveRoomOnDevice } from "@/lib/saved-rooms";
export function SaveRoom({roomId}:{roomId:string}) {
  const [saved,setSaved]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{const refresh=()=>setSaved(savedRooms().includes(roomId.toLowerCase()));refresh();window.addEventListener(SAVED_ROOMS_EVENT,refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener(SAVED_ROOMS_EVENT,refresh);window.removeEventListener("storage",refresh);};},[roomId]);
  return <div className="save-room"><button className="secondary-button" aria-pressed={saved} onClick={()=>{try{saveRoomOnDevice(roomId,!saved);setNotice(saved?"Removed from this device.":"Saved on this device. Find it in Following—no wallet needed.");}catch{setNotice("This browser cannot save the room. Bookmark the permanent room link instead.");}}}>{saved?"✓ Saved on this device":"Save on this device"}</button>{notice&&<span role="status">{notice}</span>}</div>;
}
