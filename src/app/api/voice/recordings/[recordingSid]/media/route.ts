import { reviewOperator } from "@/lib/review-auth";
import { getOwnedRecording } from "@/lib/review-store";
import { recordingSidPattern, recordingAccessible } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params:Promise<{ recordingSid:string }> };
export async function GET(request: Request, context: Context) {
  const operator = await reviewOperator();
  if (operator instanceof Response) return operator;
  const { recordingSid } = await context.params;
  if (!recordingSidPattern.test(recordingSid)) return voiceJson({ error:"Invalid recording reference." },400);
  const range = request.headers.get("range");
  if (range && !/^bytes=\d+-\d*$/.test(range)) return voiceJson({ error:"Unsupported audio range." },416);
  try {
    const recording = await getOwnedRecording(recordingSid,operator.userId);
    if (!recording) return voiceJson({ error:"Recording not found." },404);
    if (!recordingAccessible(recording)) return voiceJson({ error:"Recording is not ready, expired, or deleted." },410);
    const account = process.env.TWILIO_ACCOUNT_SID;
    const key = process.env.TWILIO_API_KEY_SID;
    const secret = process.env.TWILIO_API_KEY_SECRET;
    if (!account || !/^AC[0-9a-f]{32}$/i.test(account) || !key || !secret) throw new Error();
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${recordingSid}.mp3`;
    const options: RequestInit = {
      headers:{ Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,"Accept-Encoding":"identity",...(range ? { Range:range } : {}) },
      cache:"no-store",signal:AbortSignal.timeout(20000),
    };
    let upstream = await fetch(`${mediaUrl}?RequestedChannels=${recording.channels === 1 ? 1 : 2}`,options);
    if (upstream.status === 400 && recording.channels !== 1) {
      await upstream.body?.cancel();
      upstream = await fetch(`${mediaUrl}?RequestedChannels=1`,{...options,signal:AbortSignal.timeout(20000)});
    }
    if (upstream.status === 416) return new Response(null,{status:416,headers:{"Cache-Control":"private, no-store",...(upstream.headers.get("content-range") ? {"Content-Range":upstream.headers.get("content-range")!} : {})}});
    if (![200,206].includes(upstream.status) || !upstream.body) return voiceJson({ error:"Audio is unavailable from Twilio." },upstream.status === 404 ? 404 : 503);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers({ "Content-Type":"audio/mpeg","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin",
      "Content-Disposition":`${download ? "attachment" : "inline"}; filename="veilcall-${recordingSid}.mp3"`,"Accept-Ranges":"bytes" });
    for (const name of ["content-length","content-range"]) { const value = upstream.headers.get(name); if (value) headers.set(name,value); }
    return new Response(upstream.body,{status:upstream.status,headers});
  } catch { return voiceJson({ error:"Recording playback is temporarily unavailable." },503); }
}
