import { reviewBody, reviewOperator } from "@/lib/review-auth";
import { dashboardQuery } from "@/lib/dashboard-validation";
import { emailReminderConfig } from "@/lib/email-reminder-config";
import { verifiedOperatorEmail } from "@/lib/email-recipient";
import { getEmailPreferences, saveEmailPreferences } from "@/lib/email-reminder-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
async function settings(operatorId:string) {
  return {...await getEmailPreferences(operatorId),configured:!!emailReminderConfig(),recipient:await verifiedOperatorEmail(operatorId).catch(()=>null)};
}
export async function GET() {
  const operator=await reviewOperator();if(operator instanceof Response)return operator;
  try{return voiceJson(await settings(operator.userId));}
  catch{return voiceJson({error:"Email reminder settings could not be loaded."},503);}
}
export async function PUT(request:Request) {
  const operator=await reviewOperator(request);if(operator instanceof Response)return operator;
  let body;
  try{body=await reviewBody(request);}catch{return voiceJson({error:"Choose valid email settings."},400);}
  if(!body || typeof body!=="object" || !("enabled" in body) || !("timezone" in body) || typeof body.enabled!=="boolean" || typeof body.timezone!=="string")return voiceJson({error:"Choose valid email settings."},400);
  const query=dashboardQuery(new URLSearchParams({timezone:body.timezone}));if(!query)return voiceJson({error:"Choose a valid timezone."},400);
  try {
    if(body.enabled && !emailReminderConfig())return voiceJson({error:"Email delivery has not been configured yet."},503);
    if(body.enabled && !await verifiedOperatorEmail(operator.userId))return voiceJson({error:"Verify your primary email address in your account before enabling email reminders."},400);
    await saveEmailPreferences(operator.userId,body.enabled,query.timezone);
    return voiceJson(await settings(operator.userId));
  } catch{return voiceJson({error:"Email settings could not be confirmed. Reload settings before retrying."},503);}
}
