import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { voiceService, voiceWebhookUrl } from "@/lib/voice-service";
import { storeCall, storeRecording, getReview, acquireRecordingLease, releaseRecordingLease,
  getOwnedRecording, tombstoneRecording, finishRecordingDeletion } from "@/lib/review-store";
import type { RecordingInstance } from "twilio/lib/rest/api/v2010/account/recording";

export class ReviewError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export async function ownedProviderCall(callSid: string, userId: string) {
  const client = voiceService();
  let parent;
  try { parent = await client.calls(callSid).fetch(); }
  catch { throw new ReviewError("Call not found or unavailable.",404); }
  if (parent.from !== `client:${userId}` || parent.parentCallSid) throw new ReviewError("Call not found.",404);
  const children = await client.calls.list({ parentCallSid: callSid, limit: 1 });
  const child = children[0];
  await storeCall({ callSid,operatorId:userId,to:child?.to ?? "",from:child?.from ?? "",
    country:child?.to ? parsePhoneNumberFromString(child.to)?.country ?? "" : "",
    startedAt:parent.startTime ?? parent.dateCreated,status:child?.status ?? parent.status,
    duration:Math.max(0,Number(child?.duration || 0)) });
  return { client, parent, child };
}

export async function syncRecentCalls(userId: string) {
  const parents = await voiceService().calls.list({ from: `client:${userId}`, limit: 25 });
  let imported = 0;
  // Bound both provider requests and concurrency for a private operator's recent calls.
  for (let i=0; i<parents.length; i+=3) {
    await Promise.all(parents.slice(i,i+3).filter((call) => !call.parentCallSid && call.from === `client:${userId}`).map(async (call) => {
      await ownedProviderCall(call.sid,userId); imported += 1;
    }));
  }
  return imported;
}

export async function reconcileRecordings(callSid: string, userId: string) {
  const owned = await getReview(callSid,userId);
  if (!owned) throw new ReviewError("Call not found.",404);
  const client = voiceService();
  try {
    const records = await client.calls(callSid).recordings.list({ limit:20 });
    for (const current of records) {
      if (current.callSid === callSid) await saveProviderRecording(current);
    }
  } catch {
    // Saved metadata remains usable during a temporary provider outage.
  }
  return (await getReview(callSid,userId))!;
}

export async function saveProviderRecording(record: Pick<RecordingInstance,"sid"|"callSid"|"status"|"duration"|"channels"|"dateCreated">) {
  await storeRecording({ sid:record.sid,callSid:record.callSid,status:record.status,
    duration:Math.max(0,Number(record.duration || 0)),channels:record.channels === 1 ? 1 : 2,createdAt:record.dateCreated });
}

export async function controlRecording(input: { callSid: string; action: string; recordingSid?: string; consentConfirmed?: boolean }, userId: string) {
  const { client, child } = await ownedProviderCall(input.callSid,userId);
  if ((input.action === "start" || input.action === "resume") && process.env.VOICE_RECORDING_ENABLED !== "true") {
    throw new ReviewError("Recording is disabled.",503);
  }
  if (["start","resume"].includes(input.action) && input.consentConfirmed !== true) throw new ReviewError("Confirm that all participants agreed before recording.",400);
  if (child?.status !== "in-progress") throw new ReviewError("Recording controls are available after the recipient answers and before the call ends.",409);
  const token = await acquireRecordingLease(input.callSid,userId,input.action === "start");
  if (!token) throw new ReviewError("A recording change is already in progress. Try again shortly.",409);
  let startedSid: string | undefined;
  try {
    const recordings = await client.calls(input.callSid).recordings.list({ limit: 20 });
    const active = recordings.find((item) => ["in-progress","paused"].includes(item.status));
    if (input.action === "start") {
      if (active) throw new ReviewError("This call already has an active recording. Refresh its status before continuing.",409);
      const recording = await client.calls(input.callSid).recordings.create({
        recordingChannels:"dual",recordingTrack:"both",trim:"do-not-trim",
        recordingStatusCallback:voiceWebhookUrl("/api/voice/recordings/callback"),
        recordingStatusCallbackMethod:"POST",recordingStatusCallbackEvent:["in-progress","completed","absent"],
      });
      startedSid = recording.sid;
      await saveProviderRecording(recording);
    } else {
      if (!input.recordingSid || active?.sid !== input.recordingSid) throw new ReviewError("The active recording changed. Refresh and try again.",409);
      const stored = await getOwnedRecording(input.recordingSid,userId);
      if (!stored || stored.callSid !== input.callSid || stored.deletedAt) throw new ReviewError("Recording not found.",404);
      if (Date.parse(stored.expiresAt) <= Date.now()) throw new ReviewError("This recording has expired.",410);
      const status = input.action === "pause" ? "paused" : input.action === "resume" ? "in-progress" : "stopped";
      const recording = await client.calls(input.callSid).recordings(input.recordingSid).update({ status, ...(status === "paused" ? { pauseBehavior:"silence" } : {}) });
      await saveProviderRecording(recording);
    }
  } catch (error) {
    if (startedSid) {
      // Do not leave an orphan recording running if its durable metadata could not be saved.
      await client.calls(input.callSid).recordings(startedSid).update({ status:"stopped" }).catch(() => {});
    }
    throw error;
  } finally { await releaseRecordingLease(input.callSid,token); }
  return reconcileRecordings(input.callSid,userId);
}

export async function deleteProviderRecording(sid: string) {
  await tombstoneRecording(sid);
  try { await voiceService().recordings(sid).remove(); }
  catch (error) { if ((error as { status?: number }).status !== 404) throw error; }
  await finishRecordingDeletion(sid);
}
