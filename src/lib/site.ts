export const siteConfig = {
  name: "VeilCall",
  company: "VeilCode Studio",
  title: "VeilCall | A clearer way to connect",
  description:
    "A browser calling workspace for conversations, follow-ups and private call review. UK and Australia routes are available when your account, number and calling setup are approved.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;
