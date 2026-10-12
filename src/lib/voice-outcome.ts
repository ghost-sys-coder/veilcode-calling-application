export interface VoiceOutcome {
  status: string;
  errorCode?: string;
  message: string;
  failed: boolean;
  pending: boolean;
}

export function getVoiceOutcome(status: string, errorCode?: string): VoiceOutcome {
  if (errorCode) {
    const knownErrors: Record<string, string> = {
      "13225": "Twilio blocked this destination. Ask Twilio Support to review the number and your account's +1 calling eligibility.",
      "13224": "Twilio rejected the phone number. Check the recipient's number and country code.",
      "13227": "Twilio geographic permissions do not allow this destination. Check Voice Dialing Geographic Permissions.",
    };
    return {
      status, errorCode, failed: true, pending: false,
      message: `${knownErrors[errorCode] ?? "Twilio could not complete this call. Check its Call Logs for details."} (Error ${errorCode})`,
    };
  }
  const messages: Record<string, string> = {
    completed: "The telephone call has ended.",
    busy: "The recipient's line was busy.",
    "no-answer": "The recipient did not answer.",
    canceled: "The call was cancelled before it connected.",
    failed: "Twilio could not connect the telephone call. Check its Call Logs for details.",
  };
  return {
    status,
    message: messages[status] ?? "Call details are still updating. Check Twilio Call Logs for the final outcome.",
    failed: status === "failed",
    // A failure notification can arrive shortly after the call's final status.
    pending: !messages[status] || status === "failed",
  };
}
