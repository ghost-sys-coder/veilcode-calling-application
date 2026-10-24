export interface BusinessProfile {
  businessName: string; contactName: string; businessCountry: string; website: string; purpose: string;
}
export type NumberRequestStatus = "pending" | "approved" | "verifying" | "verified" | "fulfilled" | "failed" | "rejected" | "revoked";
export interface NumberRequestInput {
  kind: "existing" | "new"; label: string; phone: string | null; numberCountry: string; details: string; ownershipConfirmed: boolean;
}
export interface NumberRequest extends NumberRequestInput {
  id: string; operatorId: string; status: NumberRequestStatus; revision: number; reviewNote: string;
  business: BusinessProfile; createdAt: string; updatedAt: string;
  verification: { code: string | null; expiresAt: string } | null;
}
export interface CallerIdentity {
  number: string; label: string; source: "verified" | "provisioned"; status: "active" | "revoked";
}
export interface NumberSetupSummary {
  profile: BusinessProfile | null; requests: NumberRequest[]; identities: CallerIdentity[];
  legacyCallerIds: {number:string;label:string}[]; operatorApproved: boolean; admin: boolean; verificationEnabled: boolean;
}
export interface NumberReviewInput {
  action: "approve" | "reject" | "fulfill" | "revoke"; expectedRevision: number; note: string; phone: string | null; complianceConfirmed:boolean;
}
export const numberStatusLabels: Record<NumberRequestStatus,string> = {
  pending:"Awaiting review", approved:"Approved", verifying:"Verification in progress", verified:"Ownership verified",
  fulfilled:"Number assigned", failed:"Verification incomplete", rejected:"Changes required", revoked:"Number disabled",
};
