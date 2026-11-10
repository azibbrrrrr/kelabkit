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

/** The spec's seven sections plus Matriks, the spreadsheet view, after Kutipan. */
export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: House, description: "Ringkasan kutipan semasa" },
  { title: "Kutipan KGK", href: "/kutipan/", icon: WalletCards, description: "Cipta dan urus kutipan" },
  { title: "Matriks", href: "/matriks/", icon: Sheet, description: "Jadual ahli × kutipan" },
  { title: "Ahli", href: "/ahli/", icon: UsersRound, description: "Senarai guru dan kakitangan" },
  { title: "Rekod Bayaran", href: "/bayaran/", icon: ReceiptText, description: "Rekod dan semak bayaran" },
  { title: "Peringatan", href: "/peringatan/", icon: Bell, description: "Mesej susulan kepada ahli" },
  { title: "Laporan", href: "/laporan/", icon: FileText, description: "Ringkasan dan eksport" },
  { title: "Tetapan", href: "/tetapan/", icon: Settings, description: "Kelab, tema dan paparan" },
];

export function isActive(pathname: string, href: string) {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (href === "/") return path === "/";
  return path.startsWith(href);
}

export function currentSection(pathname: string) {
  return navItems.find((item) => isActive(pathname, item.href));
}
