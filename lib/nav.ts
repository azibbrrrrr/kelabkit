import { t, type MessageKey } from "@/lib/i18n";
import {
  Bell,
  FileText,
  House,
  ReceiptText,
  Settings,
  Sheet,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon; description: string };

type NavDef = { id: string; href: string; icon: LucideIcon };

const defs: NavDef[] = [
  { id: "dashboard", href: "/", icon: House },
  { id: "collections", href: "/kutipan/", icon: WalletCards },
  { id: "matrix", href: "/matriks/", icon: Sheet },
  { id: "members", href: "/ahli/", icon: UsersRound },
  { id: "payments", href: "/bayaran/", icon: ReceiptText },
  { id: "reminders", href: "/peringatan/", icon: Bell },
  { id: "reports", href: "/laporan/", icon: FileText },
  { id: "settings", href: "/tetapan/", icon: Settings },
];

/** The spec's seven sections plus Matriks, the spreadsheet view, after Kutipan. Titles follow the locale. */
export const navItems: NavItem[] = defs.map((def) => ({
  href: def.href,
  icon: def.icon,
  get title() {
    return t(`nav.${def.id}` as MessageKey);
  },
  get description() {
    return t(`nav.${def.id}Hint` as MessageKey);
  },
}));

/**
 * Routes that carry their own fixed action bar (the wizard's Batal / Seterusnya, the payment form's
 * Simpan). The phone shell's floating actions step aside there so two hit areas never touch.
 */
export function hasOwnActionBar(pathname: string) {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return path === "/kutipan/baru/" || path === "/bayaran/baru/";
}

export function isActive(pathname: string, href: string) {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (href === "/") return path === "/";
  return path.startsWith(href);
}

export function currentSection(pathname: string) {
  return navItems.find((item) => isActive(pathname, item.href));
}
