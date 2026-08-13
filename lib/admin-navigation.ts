import type { LucideIcon } from "lucide-react";
import { Shield, Bot, SlidersHorizontal, Users } from "lucide-react";

export interface AdminNavigationItem {
  /** i18n key under the "admin" namespace, e.g. "nav.dashboard". */
  titleKey: string;
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItem[] = [
  {
    titleKey: "nav.dashboard",
    href: "/admin",
    icon: Shield,
  },
  {
    titleKey: "nav.aiUsage",
    href: "/admin/ai-usage",
    icon: Bot,
  },
  {
    titleKey: "nav.aiConfig",
    href: "/admin/ai-config",
    icon: SlidersHorizontal,
  },
  {
    titleKey: "nav.onboarding",
    href: "/admin/onboarding",
    icon: Users,
  },
];
