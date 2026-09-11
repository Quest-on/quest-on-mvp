import { describe, expect, it } from "vitest";
import { authEmailErrorKey } from "../lib/auth-email-error";

describe("authEmailErrorKey", () => {
  it("maps the Supabase send quota to a retry-later message", () => {
    expect(authEmailErrorKey({ code: "over_email_send_rate_limit", status: 429 })).toBe(
      "emailRateLimited",
    );
  });

  it("maps default SMTP recipient restrictions separately", () => {
    expect(authEmailErrorKey({ message: "Email address not authorized" })).toBe(
      "emailNotAuthorized",
    );
  });

  it("does not expose unknown provider messages", () => {
    expect(authEmailErrorKey({ message: "sensitive provider detail" })).toBe(
      "emailSendFailed",
    );
  });
});
