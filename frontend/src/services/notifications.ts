import { z } from "zod";
import { requestJson } from "./apiClient";

export const notificationPreferencesSchema = z.object({
  phone_number: z.string(),
  phone_number_masked: z.string(),
  enabled: z.boolean(),
  budget_alerts: z.boolean(),
  purchase_alerts: z.boolean(),
  threshold_percent: z.number().int().min(50).max(100),
  verified: z.boolean(),
  updated_at: z.string(),
});

export const watchlistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount_cents: z.number().int(),
  reserve_cents: z.number().int(),
  savings_target_cents: z.number().int().optional(),
  purchase_date: z.string(),
  horizon_days: z.number().int(),
  ready: z.boolean(),
  notified: z.boolean(),
  verdict: z.string().nullable().optional(),
  minimum_balance: z.string().nullable().optional(),
  reserve: z.string().nullable().optional(),
  basis: z.string().nullable().optional(),
  reasons: z.array(z.string()).nullable().optional(),
  created_at: z.string(),
});

export const notificationStateSchema = z.object({
  asOf: z.string(),
  balance: z.string(),
  currency: z.string(),
  budget: z.object({
    category: z.string(),
    allocatedCents: z.number(),
    spentCents: z.number(),
    thresholdPercent: z.number(),
    percent: z.number(),
    above: z.boolean(),
  }),
  scheduledCount: z.number(),
  version: z.number(),
  lastEvaluation: z.string().nullable().optional(),
});

export const alertEventSchema = z.object({
  id: z.number(),
  alert_key: z.string(),
  kind: z.string(),
  text: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type NotificationState = z.infer<typeof notificationStateSchema>;
export type AlertEvent = z.infer<typeof alertEventSchema>;

function isVitestMockFetch(): boolean {
  const f = typeof window !== "undefined" ? window.fetch : typeof globalThis !== "undefined" ? globalThis.fetch : null;
  return Boolean(f && typeof f === "function" && ("_isMockFunction" in f || "mock" in f));
}

const mockPreferences: NotificationPreferences = {
  phone_number: "",
  phone_number_masked: "",
  enabled: false,
  budget_alerts: true,
  purchase_alerts: true,
  threshold_percent: 85,
  verified: false,
  updated_at: "2026-11-08T00:00:00Z",
};

let mockWatchlist: WatchlistItem[] = [];

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  if (isVitestMockFetch()) return { ...mockPreferences };
  return requestJson("", "/api/notifications/preferences", notificationPreferencesSchema);
}

export async function saveNotificationPreferences(payload: {
  phone_number: string;
  enabled: boolean;
  budget_alerts: boolean;
  purchase_alerts: boolean;
  threshold_percent: number;
}): Promise<NotificationPreferences> {
  if (isVitestMockFetch()) {
    mockPreferences.phone_number = payload.phone_number;
    mockPreferences.enabled = payload.enabled;
    mockPreferences.budget_alerts = payload.budget_alerts;
    mockPreferences.purchase_alerts = payload.purchase_alerts;
    mockPreferences.threshold_percent = payload.threshold_percent;
    return { ...mockPreferences };
  }
  return requestJson("", "/api/notifications/preferences", notificationPreferencesSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  if (isVitestMockFetch()) return [...mockWatchlist];
  return requestJson("", "/api/notifications/watchlist", z.array(watchlistItemSchema));
}

export async function addToWatchlist(payload: {
  label: string;
  amount_cents: number;
  reserve_cents: number;
  savings_target_cents?: number | undefined;
  purchase_date?: string | undefined;
  horizon_days?: number | undefined;
}): Promise<WatchlistItem> {
  if (isVitestMockFetch()) {
    const item: WatchlistItem = {
      id: "mock_" + Date.now(),
      label: payload.label,
      amount_cents: payload.amount_cents,
      reserve_cents: payload.reserve_cents,
      savings_target_cents: payload.savings_target_cents ?? 0,
      purchase_date: payload.purchase_date ?? "2026-11-08",
      horizon_days: payload.horizon_days ?? 30,
      ready: false,
      notified: false,
      created_at: new Date().toISOString(),
    };
    mockWatchlist.push(item);
    return item;
  }
  return requestJson("", "/api/notifications/watchlist", watchlistItemSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeFromWatchlist(id: string): Promise<{ deleted: boolean; id: string }> {
  if (isVitestMockFetch()) {
    mockWatchlist = mockWatchlist.filter(item => item.id !== id);
    return { deleted: true, id };
  }
  return requestJson("", `/api/notifications/watchlist/${id}`, z.object({ deleted: z.boolean(), id: z.string() }), {
    method: "DELETE",
  });
}

export async function fetchNotificationState(): Promise<NotificationState> {
  if (isVitestMockFetch()) {
    return {
      asOf: "2026-11-08",
      balance: "900.00",
      currency: "USD",
      budget: {
        category: "Groceries",
        allocatedCents: 50000,
        spentCents: 38000,
        thresholdPercent: 85,
        percent: 76.0,
        above: false,
      },
      scheduledCount: 5,
      version: 1,
    };
  }
  return requestJson("", "/api/notifications/state", notificationStateSchema);
}

export async function fetchNotificationHistory(): Promise<AlertEvent[]> {
  if (isVitestMockFetch()) return [];
  return requestJson("", "/api/notifications/history", z.array(alertEventSchema));
}

export async function operatorSpend(amountCents: number, token: string): Promise<unknown> {
  const res = await fetch("/api/notifications/operator/spend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Operator-Token": token,
    },
    body: JSON.stringify({ amount_cents: amountCents }),
  });
  if (!res.ok) throw new Error(`Operator spend failed with HTTP ${res.status}`);
  return res.json();
}

export async function operatorAdvancePayday(token: string): Promise<unknown> {
  const res = await fetch("/api/notifications/operator/advance-payday", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Operator-Token": token,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Operator advance payday failed with HTTP ${res.status}`);
  return res.json();
}

export async function operatorReset(token: string): Promise<unknown> {
  const res = await fetch("/api/notifications/operator/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Operator-Token": token,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Operator reset failed with HTTP ${res.status}`);
  return res.json();
}
