// app/lib/auth/middleware.server.js
// requireAuth — drop-in replacement for authenticate.admin(request)

import { redirect } from "react-router";
import { getUser } from "./session.server.js";
import prisma from "../../db.server.js";

/**
 * Requires the user to be logged in.
 * Returns { user, store, storeId } where store is the active StoreConnection.
 * Throws a redirect to /login if not authenticated.
 */
export async function requireAuth(request) {
  const user = await getUser(request);
  if (!user) throw redirect("/login");

  // Get the active store connection for this user
  const connection = await prisma.storeConnection.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { connectedAt: "desc" },
  });

  // Find or create the Store record by shopDomain
  let store = null;
  if (connection) {
    store = await prisma.store.findUnique({ where: { shopDomain: connection.shopDomain } });
    if (!store) {
      store = await prisma.store.create({
        data: { shopDomain: connection.shopDomain, shopName: connection.shopDomain },
      });
    }
  }

  return { user, connection, store, storeId: store?.id ?? null };
}

/**
 * Get active StoreConnection domain for a user (used as session.shop replacement)
 */
export async function getActiveConnection(userId) {
  return prisma.storeConnection.findFirst({
    where:   { userId, isActive: true },
    orderBy: { connectedAt: "desc" },
  });
}

/**
 * Redirect to /app if already logged in (for login/register pages)
 */
export async function requireGuest(request) {
  const user = await getUser(request);
  if (user) throw redirect("/app");
}
