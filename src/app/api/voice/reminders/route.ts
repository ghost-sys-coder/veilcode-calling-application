import { reviewOperator } from "@/lib/review-auth";
import { dashboardQuery } from "@/lib/dashboard-validation";
import { getReminders } from "@/lib/reminder-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(request:Request) {
  const operator=await reviewOperator();if (operator instanceof Response) return operator;
  const query=dashboardQuery(new URL(request.url).searchParams);
  if (!query) return voiceJson({error:"Choose a valid timezone."},400);
  try {return voiceJson(await getReminders(operator.userId,query.timezone));}
  catch {return voiceJson({error:"Callback reminders could not be loaded. Please retry."},503);}
}
