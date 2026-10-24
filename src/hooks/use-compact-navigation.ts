"use client";
import { useSyncExternalStore } from "react";

// Includes large tablets in landscape without changing desktop navigation.
const query="(max-width: 1279px), (max-width: 1440px) and (hover: none) and (pointer: coarse)";
function subscribe(onChange:()=>void) {
  const media=window.matchMedia(query);
  media.addEventListener("change",onChange);
  return ()=>media.removeEventListener("change",onChange);
}
export function useCompactNavigation() {
  return useSyncExternalStore(subscribe,()=>window.matchMedia(query).matches,()=>false);
}
