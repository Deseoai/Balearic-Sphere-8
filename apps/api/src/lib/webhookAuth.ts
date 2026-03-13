import crypto from "node:crypto";

type VerifyWebhookInput = {
  secret: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  body: unknown;
  maxSkewSeconds: number;
};

export function verifyWebhookSignature(input: VerifyWebhookInput): {
  ok: boolean;
  reason?: string;
} {
  const { secret, signatureHeader, timestampHeader, body, maxSkewSeconds } = input;

  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: "missing_signature_or_timestamp" };
  }

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowMs = Date.now();
  const skewMs = Math.abs(nowMs - timestampMs);
  if (skewMs > maxSkewSeconds * 1000) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  const canonicalBody = stableJsonStringify(body);
  const signedPayload = `${timestampHeader}.${canonicalBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const valid = crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  return valid ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

export function createWebhookSignature(input: {
  secret: string;
  timestampMs: number;
  body: unknown;
}): string {
  const canonicalBody = stableJsonStringify(input.body);
  const signedPayload = `${input.timestampMs}.${canonicalBody}`;
  return crypto.createHmac("sha256", input.secret).update(signedPayload).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const content = entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJsonStringify(nested)}`)
      .join(",");
    return `{${content}}`;
  }

  return JSON.stringify(value);
}
