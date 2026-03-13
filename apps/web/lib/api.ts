export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.balea-sphere8.com").replace(/\/$/, "");

const SESSION_STORAGE_KEY = "balea_session_token";

type RequestOptions = {
  auth?: boolean;
  method?: "GET" | "POST";
  payload?: unknown;
};

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
  return value && value.length > 20 ? value : null;
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, token);
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function requestJson<TResponse>(path: string, options: RequestOptions): Promise<TResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.auth) {
    const token = getSessionToken();
    if (!token) {
      throw new Error("missing_session_token");
    }
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.payload ? JSON.stringify(options.payload) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${options.method ?? "GET"} ${path} failed: ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export async function getJson<TResponse>(path: string, options?: { auth?: boolean }): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: "GET",
    auth: options?.auth ?? false
  });
}

export async function postJson<TResponse>(path: string, payload: unknown, options?: { auth?: boolean }): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: "POST",
    payload,
    auth: options?.auth ?? false
  });
}

