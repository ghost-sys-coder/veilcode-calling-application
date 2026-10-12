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
