import "server-only";

export function isApprovedOperator(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowed = (process.env.CLERK_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  // Fail closed, a newly created Clerk account alone cannot make paid calls.
  return allowed.includes(userId);
}

// Environment approval remains the explicit, protected legacy pilot boundary.
// Customer accounts use a separate owner-reviewed database record.
export async function operatorHasAccess(userId:string|null|undefined):Promise<boolean> {
  if(!userId)return false;
  if(isApprovedOperator(userId))return true;
  try {
    const {getOperatorAccess}=await import("@/lib/customer-access");
    return (await getOperatorAccess(userId))?.status==="approved";
  } catch {return false;}
}

export async function approvedOperatorIds():Promise<string[]> {
  const configured=(process.env.CLERK_ALLOWED_USER_IDS ?? "").split(",").map(id=>id.trim()).filter(Boolean);
  const {reviewDatabase}=await import("@/lib/review-db");
  const result=await reviewDatabase().query<{id:string}>("SELECT operator_id AS id FROM veilcall_operator_access WHERE status='approved'");
  return [...new Set([...configured,...result.rows.map(row=>row.id)])];
}
