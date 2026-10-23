import { dashboardRanges, type DashboardRange } from "@/lib/dashboard-types";
export function dashboardQuery(params:URLSearchParams):{range:DashboardRange;timezone:string} | null {
  const range=params.get("range") ?? "7d";
  const timezone=params.get("timezone") ?? "UTC";
  if (!dashboardRanges.some((item)=>item.value===range) || timezone.length>80 ||
    !(timezone==="UTC" || /^[A-Za-z_]+\/[A-Za-z_+\-/0-9]+$/.test(timezone))) return null;
  try {new Intl.DateTimeFormat("en",{timeZone:timezone}).format();} catch {return null;}
  return {range:range as DashboardRange,timezone};
}
