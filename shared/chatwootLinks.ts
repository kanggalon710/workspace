/** Pure builders for Chatwoot deep-link URLs. No I/O - testable. */

function base(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  if (!baseUrl || accountId == null) return null;
  return `${baseUrl.replace(/\/+$/, "")}/app/accounts/${accountId}`;
}

export function chatwootAccountUrl(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  const b = base(baseUrl, accountId);
  return b ? `${b}/dashboard` : null;
}

export function chatwootContactsUrl(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  const b = base(baseUrl, accountId);
  return b ? `${b}/contacts` : null;
}

export function chatwootContactUrl(
  baseUrl: string | null | undefined,
  accountId: number | null | undefined,
  contactId: number | null | undefined,
): string | null {
  const b = base(baseUrl, accountId);
  return b && contactId != null ? `${b}/contacts/${contactId}` : null;
}

export function chatwootConversationUrl(
  baseUrl: string | null | undefined,
  accountId: number | null | undefined,
  conversationId: number | null | undefined,
): string | null {
  const b = base(baseUrl, accountId);
  return b && conversationId != null ? `${b}/conversations/${conversationId}` : null;
}
