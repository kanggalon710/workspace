import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("id-ID").format(num);
}

export function getUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "active": return "text-green-500";
    case "maintenance": return "text-yellow-500";
    case "inactive": return "text-red-500";
    case "suspended": return "text-orange-500";
    case "terminated": return "text-red-600";
    default: return "text-muted-foreground";
  }
}

export function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "maintenance": return "secondary";
    case "inactive":
    case "terminated": return "destructive";
    default: return "outline";
  }
}
