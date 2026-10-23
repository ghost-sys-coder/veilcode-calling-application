import { reviewOperator } from "@/lib/review-auth";
import { dashboardQuery } from "@/lib/dashboard-validation";
import { getDashboard } from "@/lib/dashboard-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(request:Request) {
  const operator=await reviewOperator();if (operator instanceof Response) return operator;
  const query=dashboardQuery(new URL(request.url).searchParams);
  if (!query) return voiceJson({error:"Choose a supported activity period and timezone."},400);
  try {return voiceJson(await getDashboard(operator.userId,query.range,query.timezone));}
  catch {return voiceJson({error:"Dashboard data could not be loaded. Please retry."},503);}
}
