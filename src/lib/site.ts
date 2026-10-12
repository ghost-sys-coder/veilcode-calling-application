export const siteConfig = {
  name: "VeilCall",
  company: "VeilCode Studio",
  title: "VeilCall | A clearer way to connect",
  description:
    "A dedicated browser calling workspace for U.S. business outreach. Designed for one consistent business identity, powered by Twilio when calling is enabled.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;
