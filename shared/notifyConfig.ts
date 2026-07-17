/** Pure draft↔NotifyConfig transforms, shared by card-rule actions + lead rules. No I/O. */
import type { NotifyConfig } from "./schema.js";

export interface NotifyDraft {
  notifyBell: boolean;
  notifyWebhook: boolean;
  bellTarget: "assignee" | "user" | "creator";
  bellUserId: string;
  bellTitle: string;
  bellMessage: string;
  webhookUrl: string;
}

export function emptyNotifyDraft(): NotifyDraft {
  return { notifyBell: true, notifyWebhook: false, bellTarget: "assignee", bellUserId: "", bellTitle: "", bellMessage: "", webhookUrl: "" };
}

export function notifyConfigToDraft(cfg: NotifyConfig | null | undefined): NotifyDraft {
  const d = emptyNotifyDraft();
  if (!cfg) return d;
  d.notifyBell = (cfg.channels ?? []).includes("bell");
  d.notifyWebhook = (cfg.channels ?? []).includes("webhook");
  d.bellTarget = cfg.bellTarget ?? "assignee";
  d.bellUserId = cfg.bellUserId != null ? String(cfg.bellUserId) : "";
  d.bellTitle = cfg.bellTitle ?? "";
  d.bellMessage = cfg.bellMessage ?? "";
  d.webhookUrl = cfg.webhookUrl ?? "";
  return d;
}

export function notifyDraftToConfig(d: NotifyDraft): { ok: true; config: NotifyConfig } | { ok: false; error: string } {
  const channels: ("bell" | "webhook")[] = [];
  if (d.notifyBell) channels.push("bell");
  if (d.notifyWebhook) channels.push("webhook");
  if (channels.length === 0) return { ok: false, error: "Pilih minimal satu channel notifikasi" };
  const config: NotifyConfig = { channels };
  if (d.notifyBell) {
    config.bellTarget = d.bellTarget;
    if (d.bellTarget === "user") {
      if (!d.bellUserId) return { ok: false, error: "Pilih user untuk notifikasi bell" };
      config.bellUserId = Number(d.bellUserId);
    }
    if (d.bellTitle.trim()) config.bellTitle = d.bellTitle.trim();
    if (d.bellMessage.trim()) config.bellMessage = d.bellMessage.trim();
  }
  if (d.notifyWebhook) {
    if (!d.webhookUrl.trim()) return { ok: false, error: "Isi URL webhook" };
    config.webhookUrl = d.webhookUrl.trim();
  }
  return { ok: true, config };
}
