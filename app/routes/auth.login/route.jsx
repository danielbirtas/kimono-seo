// Redirect old Shopify auth.login to new login page
import { redirect } from "react-router";
export const loader = () => redirect("/login");
export const action = () => redirect("/login");
export default function OldLogin() { return null; }
