import "server-only";
import { randomUUID } from "node:crypto";
import { reviewDatabase } from "@/lib/review-db";
import { retentionDays } from "@/lib/review-validation";
import type { CallReview, ReviewRecording, ReviewInput } from "@/lib/review-types";

export interface CallMetadata {
  callSid: string; operatorId: string; to: string; from: string; country: string;
  startedAt: Date; status: string; duration: number;
}
export async function storeCall(call: CallMetadata) {
  await reviewDatabase().query(`INSERT INTO veilcall_calls
    (call_sid,operator_id,to_number,from_number,country,started_at,status,duration_seconds)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (call_sid) DO UPDATE SET
      to_number=CASE WHEN EXCLUDED.to_number<>'' THEN EXCLUDED.to_number ELSE veilcall_calls.to_number END,
      from_number=CASE WHEN EXCLUDED.from_number<>'' THEN EXCLUDED.from_number ELSE veilcall_calls.from_number END,
      country=CASE WHEN EXCLUDED.country<>'' THEN EXCLUDED.country ELSE veilcall_calls.country END,
      started_at=LEAST(veilcall_calls.started_at,EXCLUDED.started_at),
      status=CASE WHEN veilcall_calls.status IN ('completed','failed','busy','no-answer','canceled')
        AND EXCLUDED.status NOT IN ('completed','failed','busy','no-answer','canceled') THEN veilcall_calls.status ELSE EXCLUDED.status END,
      duration_seconds=GREATEST(veilcall_calls.duration_seconds,EXCLUDED.duration_seconds),updated_at=now()
    WHERE veilcall_calls.operator_id=EXCLUDED.operator_id`,
  [call.callSid,call.operatorId,call.to,call.from,call.country,call.startedAt,call.status,call.duration]);
}

const recordingJson = `jsonb_build_object('sid',r.recording_sid,'status',r.status,'duration',r.duration_seconds,
  'channels',r.channels,'createdAt',r.created_at,'expiresAt',r.expires_at,'deletedAt',r.deleted_at)`;
const callSelect = `SELECT c.call_sid AS "callSid",c.to_number AS "to",c.from_number AS "from",c.country,
  c.started_at AS "startedAt",c.status,c.duration_seconds AS duration,c.notes,c.rating,c.bookmarks,
  COALESCE((SELECT jsonb_agg(${recordingJson} ORDER BY r.created_at) FROM veilcall_recordings r
    WHERE r.call_sid=c.call_sid),'[]'::jsonb) AS recordings FROM veilcall_calls c`;

function serializeCall(row: CallReview & { startedAt: Date | string }): CallReview {
  return { ...row, startedAt: new Date(row.startedAt).toISOString() };
}

export async function listReviews(operatorId: string, cursor?: { date: string; sid: string }) {
  const result = await reviewDatabase().query<CallReview & { startedAt: Date }>(`${callSelect}
    WHERE c.operator_id=$1 ${cursor ? "AND (c.started_at,c.call_sid)<($2::timestamptz,$3)" : ""}
    ORDER BY c.started_at DESC,c.call_sid DESC LIMIT 21`, cursor ? [operatorId,cursor.date,cursor.sid] : [operatorId]);
  const items = result.rows.slice(0,20).map(serializeCall);
  const last = items.at(-1);
  return { items, nextCursor: result.rows.length > 20 && last
    ? Buffer.from(JSON.stringify({ date: last.startedAt, sid: last.callSid })).toString("base64url") : null };
}

export async function getReview(callSid: string, operatorId: string): Promise<CallReview | null> {
  const result = await reviewDatabase().query<CallReview & { startedAt: Date }>(`${callSelect} WHERE c.call_sid=$1 AND c.operator_id=$2`,[callSid,operatorId]);
  return result.rows[0] ? serializeCall(result.rows[0]) : null;
}

export async function saveReview(callSid: string, operatorId: string, input: ReviewInput): Promise<boolean> {
  const result = await reviewDatabase().query(`UPDATE veilcall_calls SET notes=$3,rating=$4,bookmarks=$5::jsonb,updated_at=now()
    WHERE call_sid=$1 AND operator_id=$2`,[callSid,operatorId,input.notes,input.rating,JSON.stringify(input.bookmarks)]);
  return result.rowCount === 1;
}

export async function acquireRecordingLease(callSid: string, operatorId: string, consent: boolean): Promise<string | null> {
  const token = randomUUID();
  const result = await reviewDatabase().query(`UPDATE veilcall_calls SET recording_token=$3,
    recording_lease_until=now()+interval '60 seconds',
    consent_confirmed_at=CASE WHEN $4 THEN now() ELSE consent_confirmed_at END,
    consent_version=CASE WHEN $4 THEN 'quality-review-v1' ELSE consent_version END
    WHERE call_sid=$1 AND operator_id=$2 AND (recording_token IS NULL OR recording_lease_until<now()) RETURNING call_sid`,
  [callSid,operatorId,token,consent]);
  return result.rowCount === 1 ? token : null;
}
export async function releaseRecordingLease(callSid: string, token: string) {
  await reviewDatabase().query("UPDATE veilcall_calls SET recording_token=NULL,recording_lease_until=NULL WHERE call_sid=$1 AND recording_token=$2",[callSid,token]);
}

export async function storeRecording(recording: {
  sid: string; callSid: string; status: string; duration: number; channels: number; createdAt: Date; controlConfirmed?:boolean;
}) {
  // Only an app call with a stored consent attestation can acquire recording metadata.
  await reviewDatabase().query(`INSERT INTO veilcall_recordings
    (recording_sid,call_sid,status,duration_seconds,channels,created_at,expires_at,consent_confirmed_at)
    SELECT $1,c.call_sid,$3,$4,$5,$6,$6::timestamptz+($7 * interval '1 day'),c.consent_confirmed_at
    FROM veilcall_calls c WHERE c.call_sid=$2 AND c.consent_confirmed_at IS NOT NULL
      AND (c.consent_confirmed_at<=$6::timestamptz+interval '5 seconds'
        OR EXISTS (SELECT 1 FROM veilcall_recordings existing WHERE existing.recording_sid=$1 AND existing.call_sid=c.call_sid))
    ON CONFLICT (recording_sid) DO UPDATE SET
      status=CASE WHEN veilcall_recordings.status IN ('completed','absent') AND EXCLUDED.status NOT IN ('completed','absent')
        THEN veilcall_recordings.status
        WHEN NOT $8 AND ((EXCLUDED.status='in-progress' AND veilcall_recordings.status='paused')
          OR (EXCLUDED.status IN ('in-progress','paused') AND veilcall_recordings.status='stopped'))
        THEN veilcall_recordings.status
        WHEN EXCLUDED.status='processing' AND veilcall_recordings.status IN ('in-progress','paused','stopped')
          AND EXISTS (SELECT 1 FROM veilcall_calls c WHERE c.call_sid=EXCLUDED.call_sid AND c.status='in-progress')
        THEN veilcall_recordings.status ELSE EXCLUDED.status END,
      duration_seconds=GREATEST(veilcall_recordings.duration_seconds,EXCLUDED.duration_seconds),
      channels=EXCLUDED.channels,updated_at=now()
    WHERE veilcall_recordings.deleted_at IS NULL AND veilcall_recordings.call_sid=EXCLUDED.call_sid`,
  [recording.sid,recording.callSid,recording.status,recording.duration,recording.channels,recording.createdAt,retentionDays(),recording.controlConfirmed === true]);
}

export async function getOwnedRecording(sid: string, operatorId: string): Promise<(ReviewRecording & { callSid: string }) | null> {
  const result = await reviewDatabase().query(`SELECT ${recordingJson} AS recording,r.call_sid AS "callSid"
    FROM veilcall_recordings r JOIN veilcall_calls c ON c.call_sid=r.call_sid
    WHERE r.recording_sid=$1 AND c.operator_id=$2`,[sid,operatorId]);
  return result.rows[0] ? { ...result.rows[0].recording, callSid: result.rows[0].callSid } : null;
}
export async function tombstoneRecording(sid: string) {
  await reviewDatabase().query(`UPDATE veilcall_recordings SET deleted_at=COALESCE(deleted_at,now()),deletion_pending=true,updated_at=now()
    WHERE recording_sid=$1`,[sid]);
}
export async function finishRecordingDeletion(sid: string) {
  await reviewDatabase().query("UPDATE veilcall_recordings SET deletion_pending=false,status='deleted',updated_at=now() WHERE recording_sid=$1",[sid]);
}
export async function expiredRecordings(): Promise<string[]> {
  const result = await reviewDatabase().query(`SELECT recording_sid FROM veilcall_recordings
    WHERE (expires_at<=now() AND deleted_at IS NULL) OR deletion_pending=true ORDER BY expires_at LIMIT 100`);
  return result.rows.map((row: { recording_sid: string }) => row.recording_sid);
}
