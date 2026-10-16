import React from "react";
import { redirect } from "next/navigation";
import { getIsPlatformAdmin } from "@/lib/platform-admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await getIsPlatformAdmin();
  if (!user) redirect("/login");
  if (!isAdmin) redirect("/");
  return children;
}
