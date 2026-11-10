import { Dashboard } from "@/components/sections/dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <Dashboard />;
}
