export type AuthEmailErrorKey =
  | "emailRateLimited"
  | "emailNotAuthorized"
  | "emailSendFailed";

type AuthEmailError = {
  code?: string;
  status?: number;
  message?: string;
};

export function authEmailErrorKey(error: AuthEmailError): AuthEmailErrorKey {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "emailRateLimited";
  }
  if (error.message?.toLowerCase().includes("email address not authorized")) {
    return "emailNotAuthorized";
  }
  return "emailSendFailed";
}
