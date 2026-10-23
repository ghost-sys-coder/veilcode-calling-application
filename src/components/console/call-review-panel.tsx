"use client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, RefreshCw, Save, X } from "lucide-react";
import { RecordingPlayer } from "@/components/console/recording-player";
import { FollowUpEditor } from "@/components/console/followup-editor";
import type { CallReview, ReviewBookmark } from "@/lib/review-types";

export function CallReviewPanel({ call, onDirtyChange, onUpdated }: {
  call:CallReview; onDirtyChange:(dirty:boolean) => void; onUpdated:(call:CallReview) => void;
}) {
  const [review,setReview] = useState(call);
  const [notes,setNotes] = useState(call.notes);
  const [rating,setRating] = useState<number | null>(call.rating);
  const [bookmarks,setBookmarks] = useState<ReviewBookmark[]>(call.bookmarks);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [followUpDirty,setFollowUpDirty] = useState(false);
  useEffect(()=>{onDirtyChange(dirty || followUpDirty);},[dirty,followUpDirty,onDirtyChange]);
  const [message,setMessage] = useState("");
  const mounted = useRef(true);
  const refresh = useCallback(async (signal?:AbortSignal) => {
    const response = await fetch(`/api/voice/reviews/${call.callSid}`,{cache:"no-store",signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "This review could not be refreshed.");
    if (!signal?.aborted && mounted.current) setReview(data);
  },[call.callSid]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    refresh(controller.signal).catch((issue) => { if (!controller.signal.aborted) setMessage(issue instanceof Error ? issue.message : "Review unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  },[refresh]);
  function changed() { setDirty(true); setMessage(""); }
  return <section className="review-panel" aria-label="Selected call review">
    <div className="review-panel-heading"><div><span className="terminal-overline">CONVERSATION / REVIEW</span><h2>{call.to || "Unknown recipient"}</h2></div><Button variant="ghost" type="button" className="review-icon-button" disabled={loading} aria-label="Refresh recording availability" onClick={() => {
      setLoading(true); refresh().catch((issue) => setMessage(issue.message)).finally(() => { if (mounted.current) setLoading(false); });
    }}><RefreshCw size={17}/></Button></div>
    <dl className="review-call-facts"><div><dt>CALLED FROM</dt><dd>{call.from || "Not available"}</dd></div><div><dt>TELEPHONE DURATION</dt><dd>{Math.floor(call.duration/60)}m {call.duration%60}s</dd></div><div><dt>CALL STATUS</dt><dd>{call.status.replaceAll("-"," ")}</dd></div></dl>
    <FollowUpEditor callSid={call.callSid} onDirtyChange={setFollowUpDirty}/>
    <div className="review-section-title"><h3>Recordings</h3><span>{loading ? "Checking availability…" : `${review.recordings.length} recording${review.recordings.length === 1 ? "" : "s"}`}</span></div>
    {review.recordings.length === 0 && <div className="review-no-audio"><p>No recording is available for this call.</p><span>Unrecorded calls cannot be recovered. For future calls, confirm consent and use Start recording in the dialer.</span></div>}
    {review.recordings.map((recording) => <RecordingPlayer key={recording.sid} recording={recording}
      bookmarks={bookmarks.filter((item) => item.recordingSid === recording.sid)}
      onBookmark={(seconds) => {
        if (saving) return;
        if (bookmarks.length >= 50) { setMessage("This call already has 50 bookmarks."); return; }
        setBookmarks((previous) => [...previous,{id:crypto.randomUUID(),recordingSid:recording.sid,seconds:Math.min(seconds,recording.duration),note:""}]); changed();
      }} onDelete={async () => {
        try {
          const response = await fetch(`/api/voice/recordings/${recording.sid}`,{method:"DELETE"});
          const data = await response.json();
          await refresh();
          if (!response.ok) throw new Error(data.error || "Recording deletion could not be confirmed.");
          if (mounted.current) setMessage("Recording deleted. Your notes and rating remain saved separately.");
        } catch (issue) { if (mounted.current) setMessage(issue instanceof Error ? issue.message : "Delete failed."); }
      }}/>)}
    <div className="review-section-title"><h3>Quality review</h3><span>{dirty ? "Unsaved changes" : "Personal notes"}</span></div>
    <Label className="review-field">Call quality<NativeSelect value={rating ?? ""} disabled={saving} onChange={(event) => { setRating(event.target.value ? Number(event.target.value) : null); changed(); }}>
      <NativeSelectOption value="">Not rated</NativeSelectOption>{[1,2,3,4,5].map((value) => <NativeSelectOption key={value} value={value}>{value} / 5{value === 1 ? " — Poor" : value === 5 ? " — Excellent" : ""}</NativeSelectOption>)}</NativeSelect></Label>
    <Label className="review-field">Review notes<Textarea value={notes} maxLength={10000} rows={5} disabled={saving} placeholder="What went well? What would you change next time?" onChange={(event) => { setNotes(event.target.value); changed(); }}/></Label>
    {bookmarks.length > 0 && <div className="review-bookmarks"><h3><Bookmark size={15}/> Bookmarked moments</h3>{bookmarks.map((bookmark,index) => <div key={bookmark.id}>
      <span>{Math.floor(bookmark.seconds/60)}:{String(bookmark.seconds%60).padStart(2,"0")}</span><Input aria-label={`Note for bookmark ${index+1}`} value={bookmark.note} maxLength={500} disabled={saving} placeholder="Why this moment matters" onChange={(event) => { setBookmarks((previous) => previous.map((item) => item.id === bookmark.id ? {...item,note:event.target.value} : item)); changed(); }}/>
      <Button variant="ghost" type="button" className="review-icon-button" disabled={saving} aria-label={`Remove bookmark ${index+1}`} onClick={() => { setBookmarks((previous) => previous.filter((item) => item.id !== bookmark.id)); changed(); }}><X size={15}/></Button>
    </div>)}</div>}
    <div className="review-save-row"><Button variant="ghost" type="button" className="vc-button vc-button-primary vc-button-md" disabled={!dirty || saving} onClick={async () => {
      setSaving(true); setMessage("");
      try {
        const response = await fetch(`/api/voice/reviews/${call.callSid}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes,rating,bookmarks})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Review was not saved.");
        if (!mounted.current) return;
        setDirty(false); onUpdated({...review,notes,rating,bookmarks}); setMessage("Review saved.");
      } catch (issue) { if (mounted.current) setMessage(issue instanceof Error ? issue.message : "Your review could not be saved."); }
      finally { if (mounted.current) setSaving(false); }
    }}><Save size={16}/>{saving ? "Saving…" : "Save review"}</Button><span>{notes.length.toLocaleString()} / 10,000</span></div>
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
    <div className="terminal-call-reference">CALL REFERENCE <code>{call.callSid}</code></div>
  </section>;
}
