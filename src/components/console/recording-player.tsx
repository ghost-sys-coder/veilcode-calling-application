"use client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Download, Trash2 } from "lucide-react";
import { recordingAccessible } from "@/lib/review-validation";
import type { ReviewRecording, ReviewBookmark } from "@/lib/review-types";

export function RecordingPlayer({ recording, bookmarks, onBookmark, onDelete }: {
  recording:ReviewRecording; bookmarks:ReviewBookmark[];
  onBookmark:(seconds:number) => void; onDelete:() => Promise<void>;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const [deleting,setDeleting] = useState(false);
  const [audioError,setAudioError] = useState(false);
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer=window.setInterval(() => setNow(Date.now()),30000); return () => window.clearInterval(timer); },[]);
  const expired = Date.parse(recording.expiresAt) <= now;
  const playable = recordingAccessible(recording,now);
  const media = `/api/voice/recordings/${recording.sid}/media`;
  return <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!deleting) setConfirmDelete(open); }}><div className="review-recording">
    <div className="review-recording-meta"><strong>{recording.duration}s · {recording.channels === 2 ? "Two audio channels" : "Mono audio"}</strong><span>{recording.deletedAt ? "Deleted" : expired ? "Expired" : recording.status}</span></div>
    {playable && !deleting ? <>
      <audio ref={audio} controls preload="none" src={media} onError={() => setAudioError(true)} aria-label="Call recording playback" />
      {audioError && <p role="alert">Audio could not be loaded. Refresh the recording or try again shortly.</p>}
      <div className="review-player-actions">
        <Label>Speed <NativeSelect aria-label="Playback speed" defaultValue="1" onChange={(event) => { if (audio.current) audio.current.playbackRate=Number(event.target.value); }}>{[0.75,1,1.25,1.5,2].map((speed) => <NativeSelectOption key={speed} value={speed}>{speed}×</NativeSelectOption>)}</NativeSelect></Label>
        <Button variant="ghost" type="button" className="review-small-button" onClick={() => onBookmark(Math.floor(audio.current?.currentTime || 0))}><BookmarkPlus size={15}/> Bookmark</Button>
        <Button asChild variant="outline" className="review-small-button"><a href={`${media}?download=1`}><Download size={15}/> Download</a></Button>
      </div>
      {bookmarks.length > 0 && <div className="review-timestamps">{bookmarks.map((bookmark) => <Button variant="ghost" type="button" key={bookmark.id} title={bookmark.note} onClick={() => { if (audio.current) audio.current.currentTime=bookmark.seconds; }}>{Math.floor(bookmark.seconds/60)}:{String(bookmark.seconds%60).padStart(2,"0")}</Button>)}</div>}
    </> : <p>{deleting ? "Deleting recording…" : recording.deletedAt ? "This audio has been deleted." : expired ? "This recording has reached its retention limit." : recording.status === "absent" ? "Twilio could not produce audio for this recording." : "Audio will be available after Twilio finishes processing it."}</p>}
    {!recording.deletedAt && !["in-progress","paused"].includes(recording.status) && <div className="review-recording-footer">
      <span>Audio expires {new Date(recording.expiresAt).toLocaleDateString()}</span>
      <AlertDialogTrigger asChild><Button variant="ghost" type="button" className="review-delete-link" disabled={deleting}><Trash2 size={14}/> Delete recording</Button></AlertDialogTrigger>
    </div>}
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Delete this recording?</AlertDialogTitle>
        <AlertDialogDescription>This permanently deletes the audio from Twilio. Call notes and ratings will remain.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
      <Button variant="destructive" type="button" disabled={deleting} onClick={async () => {
        audio.current?.pause(); setDeleting(true);
        try { await onDelete(); setConfirmDelete(false); } finally { setDeleting(false); }
      }}>{deleting ? "Deleting…" : "Delete recording"}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </div></AlertDialog>;
}
