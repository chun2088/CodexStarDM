const RESEND_API_ENDPOINT = "https://api.resend.com/emails";

function ensureConfig(name: string, value: string | undefined) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required email configuration: ${name}`);
  }

  return value;
}

type SendMagicLinkEmailInput = {
  email: string;
  magicLink: string;
  expiresAt: string;
  redirectTo?: string | null;
};

function formatExpiration(expiresAt: string) {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) {
    const fallback = new Date();
    return {
      label: "soon",
      iso: fallback.toISOString(),
    };
  }

  return {
    label: expires.toUTCString(),
    iso: expires.toISOString(),
  };
}

function buildHtmlBody({ email, magicLink, expiresAt, redirectTo }: SendMagicLinkEmailInput) {
  const { label, iso } = formatExpiration(expiresAt);
  const safeRedirect = typeof redirectTo === "string" && redirectTo ? redirectTo : "/";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Magic link sign-in</title>
  </head>
  <body>
    <p>Hello ${email},</p>
    <p>Use the secure link below to finish signing in${safeRedirect !== "/" ? ` and continue to <strong>${safeRedirect}</strong>` : ""}.</p>
    <p style="margin: 16px 0;"><a href="${magicLink}">Complete sign-in</a></p>
    <p>This link expires on <strong>${label}</strong>.</p>
    <p>If you did not request this email you can safely ignore it.</p>
    <hr />
    <p style="font-size: 12px; color: #555;">Link reference expires at ${iso}.</p>
  </body>
</html>`;
}

function buildTextBody({ magicLink, expiresAt }: SendMagicLinkEmailInput) {
  const { label } = formatExpiration(expiresAt);
  return [
    "Use the link below to finish signing in:",
    magicLink,
    "",
    `This link will expire on ${label}.`,
    "If you did not request this email you can ignore it.",
  ].join("\n");
}

export async function sendMagicLinkEmail(input: SendMagicLinkEmailInput) {
  const apiKey = ensureConfig("RESEND_API_KEY", process.env.RESEND_API_KEY);
  const fromAddress = ensureConfig("MAGIC_LINK_EMAIL_FROM", process.env.MAGIC_LINK_EMAIL_FROM);
  const subject = process.env.MAGIC_LINK_EMAIL_SUBJECT?.trim() || "Your sign-in link";

  const payload = {
    from: fromAddress,
    to: input.email,
    subject,
    html: buildHtmlBody(input),
    text: buildTextBody(input),
  } satisfies Record<string, unknown>;

  const response = await fetch(RESEND_API_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to send magic link email: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
    );
  }

  return { status: "sent" as const };
}
