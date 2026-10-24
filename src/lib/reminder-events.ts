"use client";
export const followUpsChanged="veilcall:followups-changed";
export function notifyFollowUpsChanged() {
  window.dispatchEvent(new Event(followUpsChanged));
  // Other open VeilCall tabs refresh without storing contact or call details.
  try {localStorage.setItem(followUpsChanged,`${Date.now()}:${Math.random()}`);} catch { /* Storage may be disabled. */ }
}
