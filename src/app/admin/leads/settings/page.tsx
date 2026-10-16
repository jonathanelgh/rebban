import { redirect } from "next/navigation";

export default function AdminLeadsSettingsRedirect() {
  redirect("/admin/settings?section=outreach");
}
