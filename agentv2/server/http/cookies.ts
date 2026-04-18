import crypto from "node:crypto";

// Session cookie configuration
const COOKIE_NAME = "agentv2_session";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function generateSessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`;
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(COOKIE_NAME + "=")) {
      return cookie.slice((COOKIE_NAME + "=").length);
    }
  }
  
  return null;
}

export function createSessionCookieHeader(sessionId: string): string {
  return generateSessionCookie(sessionId);
}
