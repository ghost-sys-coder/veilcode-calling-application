import { billingApiError } from "@/lib/billing-auth";
import { BillingError } from "@/lib/billing-config";
import { webhookEvent, processBillingEvent } from "@/lib/billing-service";
export const runtime="nodejs";
export async function POST(request:Request){
  try{
    if(!request.headers.get("content-type")?.startsWith("application/json"))throw new BillingError("Expected JSON.",415);
    // Bound the raw stream before signature verification. Never parse/re-encode
    // a Stripe request body before checking its signature.
    if(Number(request.headers.get("content-length")||0)>262144)throw new BillingError("Payment event is too large.",413);
    const reader=request.body?.getReader();if(!reader)throw new BillingError("Missing payment event.");
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();throw new BillingError("Payment event is too large.",413);}chunks.push(value);}}
    finally{reader.releaseLock();}
    const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    const event=webhookEvent(new TextDecoder().decode(body),request.headers.get("stripe-signature")||"");
    await processBillingEvent(event);return new Response(null,{status:204});
  }catch(error){return billingApiError(error);}
}
