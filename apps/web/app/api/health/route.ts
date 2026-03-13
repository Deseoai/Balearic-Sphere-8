import { NextResponse } from "next/server";
import { apiBaseUrl } from "../../../lib/api";

export async function GET(): Promise<NextResponse> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ status: "degraded", upstream: response.status }, { status: 503 });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json({ status: "ok", upstream: payload });
  } catch {
    return NextResponse.json({ status: "degraded", reason: "api_unreachable" }, { status: 503 });
  }
}
