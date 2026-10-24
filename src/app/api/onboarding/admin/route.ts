import { numberApiError, numberOperator } from "@/lib/number-access";
import { listNumberRequests } from "@/lib/number-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(request:Request) {
  const operator=await numberOperator(undefined,true);if(operator instanceof Response)return operator;
  const status=new URL(request.url).searchParams.get("status") || "pending";
  if(!["all","pending","approved","verifying","verified","fulfilled","failed","rejected","revoked"].includes(status))return voiceJson({error:"Choose a valid review filter."},400);
  try {return voiceJson({requests:await listNumberRequests(null,status==="all" ? undefined : status)});}
  catch(error){return numberApiError(error);}
}
