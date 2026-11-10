import { Workspace } from "@/components/shell/workspace";
import type { ReactNode } from "react";

export default function KelabLayout({ children }: { children: ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
