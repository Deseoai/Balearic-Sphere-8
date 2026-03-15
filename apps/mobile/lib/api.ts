import { getToken } from "./storage";

export const API_URL = "https://api.balea-sphere8.com";

export type User = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  role: string;
  accessLevel: string;
  verificationStatus: string;
  avatarUrl?: string;
  trustScore?: number;
  signalScore?: number;
  isElite?: boolean;
  isVip?: boolean;
};

export type CreditWallet = {
  balance: number;
  earnedBalance: number;
  purchasedBalance: number;
};

export type CreditTransaction = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: string;
};

export type NetworkNode = {
  id: string;
  type: string;
  label: string;
  targetUserId?: string;
  company?: string;
  industry?: string;
  avatarUrl?: string;
  isVip?: boolean;
  trustScore?: number;
};

export type ChatThread = {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: string;
  otherUser?: { userId: string; displayName?: string; avatarUrl?: string };
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export type MarketplaceListing = {
  id: string;
  title: string;
  description: string;
  type: string;
  category: string;
  postedBy: string;
  postedByName?: string;
  creditsCost: number;
  trustRequirement: number;
  status: string;
  createdAt: string;
};

export type Event = {
  id: string;
  title: string;
  topic: string;
  description: string;
  location: string;
  address?: string;
  dateTime: string;
  endTime?: string;
  price?: number;
  currency?: string;
  maxAttendees?: number;
  attendeeCount?: number;
  status: string;
  postedBy: string;
  postedByName?: string;
  link?: string;
};

export type EliteMessage = {
  id: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
};

export type EliteMember = {
  userId: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  trustScore?: number;
};

export type AiRequest = {
  id: string;
  promptType: string;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed";
  responseSummary?: string;
  createdAt: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Auth
export const requestMagicLink = (email: string) =>
  apiFetch("/v1/auth/request-magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const verifyMagicLink = (token: string) =>
  apiFetch<{ token: string; user: User }>("/v1/auth/verify-magic-link", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const getMe = () => apiFetch<{ user: User }>("/v1/auth/me");

export const updateMe = (data: Partial<User>) =>
  apiFetch<{ user: User }>("/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const logout = () =>
  apiFetch("/v1/auth/logout", { method: "POST" });

// Credits
export const getCredits = () =>
  apiFetch<{ wallet: CreditWallet; transactions: CreditTransaction[] }>("/v1/credits/me");

export const getCreditPackages = () =>
  apiFetch<{ packages: { id: string; name: string; credits: number; price: number; currency: string }[] }>("/v1/credits/packages");

export const checkoutCredits = (packageId: string) =>
  apiFetch<{ url: string }>("/v1/credits/checkout", {
    method: "POST",
    body: JSON.stringify({ packageId }),
  });

// Network
export const getNetworkGraph = () =>
  apiFetch<{ nodes: NetworkNode[]; edges: unknown[] }>("/v1/network/graph");

export const sendIntro = (targetUserId: string, message: string) =>
  apiFetch("/v1/network/intros", {
    method: "POST",
    body: JSON.stringify({ targetUserId, message }),
  });

// Chat
export const getChatThreads = () =>
  apiFetch<{ threads: ChatThread[] }>("/v1/chat/threads");

export const openThread = (targetUserId: string) =>
  apiFetch<{ thread: ChatThread }>("/v1/chat/threads/open", {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });

export const getMessages = (threadId: string) =>
  apiFetch<{ messages: ChatMessage[] }>(`/v1/chat/threads/${threadId}/messages`);

export const sendMessage = (threadId: string, content: string) =>
  apiFetch<{ message: ChatMessage }>(`/v1/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

// Marketplace
export const getListings = () =>
  apiFetch<{ listings: MarketplaceListing[] }>("/v1/marketplace/listings");

export const createListing = (data: Partial<MarketplaceListing>) =>
  apiFetch<{ listing: MarketplaceListing }>("/v1/marketplace/listings", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Events
export const getEvents = () =>
  apiFetch<{ events: Event[] }>("/v1/events");

export const getEvent = (id: string) =>
  apiFetch<{ event: Event; attendees: User[] }>(`/v1/events/${id}`);

export const createEvent = (data: Partial<Event>) =>
  apiFetch<{ event: Event }>("/v1/events", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const rsvpEvent = (id: string) =>
  apiFetch(`/v1/events/${id}/rsvp`, { method: "POST" });

export const cancelRsvp = (id: string) =>
  apiFetch(`/v1/events/${id}/rsvp`, { method: "DELETE" });

// Elite Circle
export const getEliteMessages = () =>
  apiFetch<{ messages: EliteMessage[] }>("/v1/elite/messages");

export const sendEliteMessage = (content: string) =>
  apiFetch<{ message: EliteMessage }>("/v1/elite/messages", {
    method: "POST",
    body: JSON.stringify({ content }),
  });

export const getEliteMembers = () =>
  apiFetch<{ members: EliteMember[] }>("/v1/elite/members");

// AI Tools
export const runAiTool = (promptType: string, prompt: string) =>
  apiFetch<{ id: string; status: string; responseSummary?: string; chargedCredits: number }>(
    "/v1/ai/requests",
    { method: "POST", body: JSON.stringify({ promptType, prompt }) }
  );

export const getAiHistory = () =>
  apiFetch<{ items: AiRequest[] }>("/v1/ai/requests");

// Push Notifications
export const registerPushToken = (deviceToken: string, platform: "ios" | "android") =>
  apiFetch<{ status: string }>("/v1/push/register", {
    method: "POST",
    body: JSON.stringify({ deviceToken, platform }),
  });

export const unregisterPushToken = (deviceToken: string) =>
  apiFetch<{ status: string }>("/v1/push/register", {
    method: "DELETE",
    body: JSON.stringify({ deviceToken }),
  });
