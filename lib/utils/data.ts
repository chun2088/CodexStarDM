export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? (value as JsonRecord) : null;
}

type NormalizeStringOptions = {
  convertDate?: boolean;
  trim?: boolean;
};

export function normalizeString(
  value: unknown,
  { convertDate = false, trim = true }: NormalizeStringOptions = {},
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    return trim ? trimmed : value;
  }

  if (convertDate && value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  return null;
}

type NormalizeIsoTimestampOptions = {
  onInvalid?: "null" | "undefined";
};

export function normalizeIsoTimestamp(
  value: unknown,
  { onInvalid = "null" }: NormalizeIsoTimestampOptions = {},
): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? (onInvalid === "undefined" ? undefined : null) : value.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      return onInvalid === "undefined" ? undefined : null;
    }

    return parsed.toISOString();
  }

  return onInvalid === "undefined" ? undefined : null;
}

export function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  return null;
}

const defaultDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(
  value: string | Date,
  formatter: Intl.DateTimeFormat = defaultDateTimeFormatter,
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  return formatter.format(date);
}
