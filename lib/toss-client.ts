const globalForToss = globalThis as unknown as {
  __tossConfig?: {
    baseUrl: string;
    secretKey: string;
  };
};

function ensureConfig(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Toss Payments environment variable: ${name}`);
  }

  return value;
}

function getTossConfig() {
  if (!globalForToss.__tossConfig) {
    const baseUrl = process.env.TOSS_API_BASE_URL?.trim() || "https://api.tosspayments.com";
    const secretKey = ensureConfig("TOSS_SECRET_KEY", process.env.TOSS_SECRET_KEY);

    globalForToss.__tossConfig = {
      baseUrl: baseUrl.replace(/\/$/, ""),
      secretKey,
    };
  }

  return globalForToss.__tossConfig;
}

async function tossFetch(path: string, init: RequestInit & { body?: unknown }) {
  const { baseUrl, secretKey } = getTossConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  let payload: unknown;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to parse Toss response: ${(error as Error).message}`);
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload && "message" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).message)
        : `Toss API request failed with status ${response.status}`;

    const error = new Error(errorMessage);
    throw error;
  }

  return payload;
}

export type TossBillingKeyResponse = {
  billingKey: string;
  customerKey: string;
  card?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export async function issueBillingKey(params: { customerKey: string; authKey: string }) {
  const payload = await tossFetch("/v1/billing/authorizations/issue", {
    method: "POST",
    body: params,
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected Toss billing key response");
  }

  const billingKey = (payload as Record<string, unknown>).billingKey;
  const customerKey = (payload as Record<string, unknown>).customerKey;

  if (typeof billingKey !== "string" || typeof customerKey !== "string") {
    throw new Error("Toss billing key response missing identifiers");
  }

  return payload as TossBillingKeyResponse;
}

export type TossBillingPaymentResponse = {
  paymentKey?: string;
  orderId?: string;
  orderName?: string;
  status?: string;
  requestedAt?: string;
  approvedAt?: string;
  [key: string]: unknown;
};

export async function requestBillingPayment(
  billingKey: string,
  body: {
    customerKey: string;
    orderId: string;
    amount: number;
    currency?: string;
    orderName?: string;
    taxFreeAmount?: number;
  },
) {
  const payload = await tossFetch(`/v1/billing/${billingKey}`, {
    method: "POST",
    body,
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected Toss billing payment response");
  }

  return payload as TossBillingPaymentResponse;
}
