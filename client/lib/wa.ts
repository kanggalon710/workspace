// WhatsApp click-to-chat link builder. Normalizes leading 0 → 62 (Indonesia) then
// strips non-digits. Shared by LeadPipelinePage + CollectionPipelinePage.
export function waLink(phone: string, msg: string): string {
  return `https://wa.me/${phone.replace(/^0/, "62").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`;
}
