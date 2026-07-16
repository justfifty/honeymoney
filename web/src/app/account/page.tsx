import { redirect } from "next/navigation";

// Account management now lives under the unified Setup hub. Keep this path alive
// (old links, the public /delete-account page) by redirecting to /setup, where
// the account section — name, password, delete/restore — renders.
export default function AccountPage() {
  redirect("/setup");
}
