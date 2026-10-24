import "server-only";
export function emailReminderConfig() {
  const apiKey=process.env.RESEND_API_KEY?.trim();
  const from=process.env.RESEND_FROM_EMAIL?.trim();
  const enabled=process.env.CALLBACK_EMAIL_ENABLED==="true";
  if(process.env.VERCEL_ENV && process.env.VERCEL_ENV!=="production")return null;
  try {
    const site=new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (!apiKey || !from || /[\r\n]/.test(from) || !/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(from.match(/<([^<>]+)>$/)?.[1] || from)
      || site.protocol!=="https:" || site.username || site.password || !enabled || !process.env.CRON_SECRET?.trim()) return null;
    return {apiKey,from,site:site.origin};
  } catch {return null;}
}
