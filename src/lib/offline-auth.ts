"use client";

export interface CachedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  shopId: string;
  userInfo: Record<string, unknown>;
}

const SESSION_KEY = "erp_session_cache";

export function cacheSession(data: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };
  shopId: string;
  userInfo: Record<string, unknown>;
}) {
  try {
    const payload: CachedSession = {
      ...data,
      expiresAt: data.expiresAt,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

export function getCachedSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: CachedSession = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearCachedSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearCachedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function hasValidCachedSession(): boolean {
  return getCachedSession() !== null;
}
