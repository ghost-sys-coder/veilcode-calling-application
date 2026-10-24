import type { EmailJob, EmailPayload } from "@/lib/email-reminder-types";
function escape(value:string) {return value.replace(/[&<>"']/g,(letter)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[letter]!);}
export function reminderEmail(job:EmailJob,recipient:string,from:string,site:string):EmailPayload {
  const when=new Date(job.callbackAt).toLocaleString("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:job.timezone});
  const url=new URL("/console/followups",site).href;
  const dialer=new URL(`/console?callback=${encodeURIComponent(job.callSid)}`,site).href;
  const person=job.name ? `${job.name} (${job.phone})` : job.phone || "your saved contact";
  return {from,to:[recipient],subject:"Your VeilCall callback is due",
    text:`Your callback to ${person} is due.\n\nScheduled: ${when} (${job.timezone})\n\nOpen the dialer: ${dialer}\nManage this callback: ${url}\n\nOpening the dialer will not start a call. If you have already handled this callback, check its current status in VeilCall.\nManage email reminders in Reminders > Email reminders.`,
    html:`<!doctype html><html><body style="margin:0;background:#f6f5f1;color:#17211e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffefa;border:1px solid #dfE2da;border-radius:8px"><p style="font-size:12px;letter-spacing:2px;color:#526358">VEILCALL</p><h1 style="font-size:28px;line-height:1.2">Time to pick up the conversation.</h1><p>Your callback to <strong>${escape(person)}</strong> is due.</p><p style="color:#526358">${escape(when)} (${escape(job.timezone)})</p><p style="margin:28px 0"><a href="${escape(dialer)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#203c2c;color:#ffffff;text-decoration:none">Open dialer</a></p><p><a href="${escape(url)}" style="color:#203c2c">Manage this callback</a></p><p style="font-size:12px;line-height:1.6;color:#526358">Opening the dialer will not start a call. If you have already handled this callback, check its current status in VeilCall.</p><p style="font-size:12px;color:#526358">Manage email reminders in Reminders &gt; Email reminders.</p></main></body></html>`};
}
