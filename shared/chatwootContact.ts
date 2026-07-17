/** Pure builders: Workspace customer → Chatwoot contact payload + labels. No I/O — testable. */
import { toWhatsappNumber } from "./phone.js";

type CustomerLike = {
  name: string; customerId: string;
  phone?: string | null; email?: string | null;
  status?: string | null; customerType?: string | null;
};

export function buildChatwootContactPayload(c: CustomerLike, opts: { tenant: string }) {
  const digits = c.phone ? toWhatsappNumber(c.phone) : "";
  const custom: Record<string, string> = { jabnet_customer_id: c.customerId, tenant: opts.tenant };
  if (c.status) custom.status = c.status;
  if (c.customerType) custom.customer_type = c.customerType;

  const payload: Record<string, any> = {
    name: c.name,
    identifier: c.customerId,
    custom_attributes: custom,
  };
  if (digits) payload.phone_number = `+${digits}`;
  if (c.email) payload.email = c.email;
  return payload;
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildChatwootContactLabels(c: CustomerLike, opts: { tenant: string }): string[] {
  const raw = [opts.tenant, c.status ?? "", c.customerType ?? ""];
  const out: string[] = [];
  for (const r of raw) {
    const s = slug(String(r));
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
