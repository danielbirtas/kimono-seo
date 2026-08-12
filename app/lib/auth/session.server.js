// app/lib/auth/session.server.js
// Cookie-based session management (no JWT dependency)

import prisma from "../../db.server.js";

const COOKIE_NAME = "kimono_session";
const SESSION_DURATION_DAYS = 30;

// ── Cookie helpers ──────────────────────────────────────────────────────────

function buildSetCookieHeader(token, opts = {}) {
  const expires = new Date(Date.now() + SESSION_DURATION_DAYS * 86400 * 1000);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=${expires.toUTCString()}`,
  ];
  // Only add Secure in production HTTPS environments
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key.trim() === COOKIE_NAME) return rest.join("=").trim();
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Create a session for a user, returns Set-Cookie header value */
export async function createSession(userId) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400 * 1000);

  const session = await prisma.userSession.create({
    data: { userId, expiresAt },
  });

  return buildSetCookieHeader(session.token);
}

/** Destroy session — returns Set-Cookie that clears the cookie */
export async function destroySession(request) {
  const token = getTokenFromRequest(request);
  if (token) {
    await prisma.userSession.deleteMany({ where: { token } }).catch(() => {});
  }
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Get the currently logged-in user (or null) */
export async function getUser(request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where:   { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.userSession.delete({ where: { token } }).catch(() => {});
    return null;
  }

  return session.user;
}
