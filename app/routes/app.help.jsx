// app/routes/app.help.jsx
// Redirects to Knowledge page
import { redirect } from "react-router";

export const loader = () => {
  throw redirect("/app/knowledge");
};

export default function Help() {
  return null;
}
