export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

export async function parseJsonResponse<T>(response: Response) {
  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(payload, `Request failed with status ${response.status}`);
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function extractSubscriptionStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>).subscriptionStatus;
  return typeof value === "string" ? value : null;
}
