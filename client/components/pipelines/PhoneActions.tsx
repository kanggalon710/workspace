import { Phone, MessageCircle } from "lucide-react";
import { telHref, whatsappHref } from "@shared/phone";
import { cn } from "@/lib/utils";

const linkCls = "inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium hover:bg-muted/50 transition-colors";

export function PhoneActions({ value }: { value: string }) {
  const tel = telHref(value);
  const wa = whatsappHref(value);
  if (!tel && !wa) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tel && (
        <a href={tel} className={cn(linkCls, "text-primary")}>
          <Phone className="size-3.5" /> Telepon
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className={cn(linkCls, "text-success")}>
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      )}
    </div>
  );
}
