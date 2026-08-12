// app/routes/logout.jsx
// Kimono SEO — Logout action

import { redirect } from "react-router";
import { destroySession } from "../lib/auth/session.server.js";

export const action = async ({ request }) => {
  const cookieHeader = await destroySession(request);
  return redirect("/login", { headers: { "Set-Cookie": cookieHeader } });
};

export const loader = async ({ request }) => {
  const cookieHeader = await destroySession(request);
  return redirect("/login", { headers: { "Set-Cookie": cookieHeader } });
};

export default function Logout() {
  return null;
}
