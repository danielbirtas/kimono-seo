// app/lib/auth/server-handler.js
// Helper to get auth context - used as dynamic import in API routes

export async function getAuthContext(request) {
  const { requireAuth } = await import("./middleware.server.js");
  return requireAuth(request);
}
