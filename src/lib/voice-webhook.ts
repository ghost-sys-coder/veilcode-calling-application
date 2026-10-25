import "server-only";
import twilio from "twilio";
import { voiceWebhookUrl } from "@/lib/voice-service";

export async function readVoiceForm(request:Request):Promise<Record<string,string>|null>{
  if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length") || 0) > 50000) return null;
  const reader=request.body?.getReader();if(!reader)return null;
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>50000){await reader.cancel();return null;}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  const params: Record<string,string> = Object.create(null);
  for (const [key,value] of new URLSearchParams(text)) {
    if (Object.hasOwn(params,key)) return null;
    params[key] = value;
  }
  return params;
}
export async function verifiedVoiceWebhook(request: Request, path: string): Promise<Record<string,string> | null> {
  const params=await readVoiceForm(request);if(!params)return null;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || params.AccountSid !== process.env.TWILIO_ACCOUNT_SID ||
    !twilio.validateRequest(token,request.headers.get("X-Twilio-Signature") ?? "",voiceWebhookUrl(path),params)) return null;
  return params;
}
