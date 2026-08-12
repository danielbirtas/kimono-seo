// app/routes/auth.$.jsx
// Redirects old Shopify auth routes to login
import { redirect } from "react-router";
export const loader = () => redirect("/login");
export const action = () => redirect("/login");
export default function AuthCatch() { return null; }
