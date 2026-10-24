export interface ReviewBookmark { id: string; recordingSid: string; seconds: number; note: string }
export interface ReviewRecording {
  sid: string; status: string; duration: number; channels: number;
  createdAt: string; expiresAt: string; deletedAt: string | null;
}
export interface CallReview {
  callSid: string; to: string; from: string; country: string; startedAt: string;
  status: string; duration: number; notes: string; rating: number | null;
  bookmarks: ReviewBookmark[]; recordings: ReviewRecording[];
}
export interface ReviewInput { notes: string; rating: number | null; bookmarks: ReviewBookmark[] }
export interface RecordingControlState {
  recordings: ReviewRecording[];
  active: ReviewRecording | null;
  canRecord: boolean;
  callStatus: string;
}
