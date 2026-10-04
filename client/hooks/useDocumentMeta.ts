import { useEffect } from "react";

const DEFAULT_TITLE = "JABNET Workspace";

function upsertMeta(name: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !el;
  const prev = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return () => {
    if (created) el!.remove();
    else if (prev != null) el!.setAttribute("content", prev);
  };
}

function upsertCanonical(href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  const prev = el?.getAttribute("href") ?? null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return () => {
    if (created) el!.remove();
    else if (prev != null) el!.setAttribute("href", prev);
  };
}

/**
 * Set title / meta description / canonical / meta robots per halaman (SPA, tanpa SSR -
 * server-truth untuk crawler tetap X-Robots-Tag + robots/sitemap di server/index.ts).
 * Dipakai halaman PUBLIK (coverage-check, login, portal login); halaman staff tidak perlu.
 * Nilai dipulihkan saat unmount supaya navigasi antar halaman tidak meninggalkan meta basi.
 */
export function useDocumentMeta(meta: {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
}) {
  const { title, description, canonical, robots } = meta;
  useEffect(() => {
    const restores: Array<() => void> = [];
    const prevTitle = document.title;
    if (title) document.title = title;
    if (description) restores.push(upsertMeta("description", description));
    if (robots) restores.push(upsertMeta("robots", robots));
    if (canonical) restores.push(upsertCanonical(canonical));
    return () => {
      document.title = title ? prevTitle || DEFAULT_TITLE : document.title;
      for (const r of restores) r();
    };
  }, [title, description, canonical, robots]);
}
