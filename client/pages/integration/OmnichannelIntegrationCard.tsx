import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { OpenInChatwootButton } from "@/components/chatwoot/OpenInChatwootButton";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2, BookOpen, Copy, Eye, EyeOff, Save, TestTube, MessageSquare, Plus, Trash2, Webhook, Users } from "lucide-react";
import { ToggleSwitch, GuideStep } from "./shared";

export interface OmnichannelConfigData {
  id: number;
  enabled: number;
  baseUrl: string | null;
  accountId: string | null;
  apiAccessToken: string | null;  // masked
  webhookSecret: string | null;   // masked
  autoCreateOnKeyword: number;
  autoNotifyOnResolve: number;
  autoSyncContacts?: number;
  defaultCategoryId: number | null;
}

export interface OmnichannelKeywordRule {
  id: number;
  keyword: string;
  categoryId: number;
  priority: string;
  isActive: number;
  sortOrder: number;
}

export function OmnichannelIntegrationCard() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { canWrite } = useAuth();
  const { data, isLoading } = useQuery<{
    config: OmnichannelConfigData | null;
    rules: OmnichannelKeywordRule[];
    hasToken: boolean;
    hasSecret: boolean;
  }>({
    queryKey: ["/api/integrations/chatwoot/config"],
    queryFn: () => api.get("/integrations/chatwoot/config"),
  });

  const { data: categories = [] } = useQuery<Array<{ id: number; name: string; color: string | null }>>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get("/ticket-categories"),
  });

  const config = data?.config;
  const rules = data?.rules ?? [];
  const isConfigured = !!(config?.baseUrl && config.accountId && data?.hasToken);

  // Form state - local until save
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [autoCreate, setAutoCreate] = useState(true);
  const [autoNotify, setAutoNotify] = useState(true);
  const [autoSyncContacts, setAutoSyncContacts] = useState(false);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<string>("");
  const [rulePriority, setRulePriority] = useState("medium");

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled === 1);
      setBaseUrl(config.baseUrl ?? "");
      setAccountId(config.accountId ?? "");
      setApiToken(config.apiAccessToken ?? "");
      setWebhookSecret(config.webhookSecret ?? "");
      setAutoCreate(config.autoCreateOnKeyword === 1);
      setAutoNotify(config.autoNotifyOnResolve === 1);
      setAutoSyncContacts(config.autoSyncContacts === 1);
      setDefaultCategoryId(config.defaultCategoryId ? String(config.defaultCategoryId) : "");
    }
  }, [config]);

  const saveMut = useMutation({
    mutationFn: () => api.put("/integrations/chatwoot/config", {
      enabled, baseUrl, accountId,
      apiAccessToken: apiToken && !apiToken.startsWith("••••") ? apiToken : undefined,
      webhookSecret: webhookSecret && !webhookSecret.startsWith("••••") ? webhookSecret : undefined,
      autoCreateOnKeyword: autoCreate,
      autoNotifyOnResolve: autoNotify,
      autoSyncContacts,
      defaultCategoryId: defaultCategoryId ? Number(defaultCategoryId) : null,
    }),
    onSuccess: () => {
      toast.success("Konfigurasi Omnichannel tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => api.post<{ success: boolean; account?: any; error?: string }>("/integrations/chatwoot/test", {}),
    onSuccess: (r: any) => {
      if (r?.success) toast.success(`✓ Koneksi OK · ${r.account?.name ?? "akun terhubung"}`);
      else toast.error(`Koneksi gagal: ${r?.error ?? "unknown"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createRuleMut = useMutation({
    mutationFn: () => api.post("/integrations/chatwoot/keyword-rules", {
      keyword: ruleKeyword.trim(),
      categoryId: Number(ruleCategoryId),
      priority: rulePriority,
      sortOrder: rules.length,
    }),
    onSuccess: () => {
      toast.success("Rule ditambahkan");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
      setRuleKeyword(""); setRuleCategoryId(""); setShowRuleForm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRuleMut = useMutation({
    mutationFn: (id: number) => api.delete(`/integrations/chatwoot/keyword-rules/${id}`),
    onSuccess: () => {
      toast.success("Rule dihapus");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/integrations/chatwoot/webhook` : "/api/integrations/chatwoot/webhook";

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Omnichannel</h3>
              <p className="text-xs text-muted-foreground">Auto-create tiket dari conversation chat (WhatsApp/web widget)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canWrite("chatwoot_settings") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/integrations/chatwoot/agents")}
                className="gap-1.5"
              >
                <Users className="h-3.5 w-3.5" />
                Pemetaan Agent
              </Button>
            )}
            <OpenInChatwootButton target="dashboard" size="sm" />
            {enabled && isConfigured ? (
              <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Aktif</Badge>
            ) : isConfigured ? (
              <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200">Konfigurasi OK · Disabled</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi</Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-32 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div>
                <div className="text-sm font-semibold">Aktifkan Omnichannel Integration</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Saat aktif, conversation baru di Omnichannel otomatis bikin tiket di JABNET
                </div>
              </div>
              <ToggleSwitch checked={enabled} onChange={setEnabled} />
            </div>

            {/* Connection form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Omnichannel URL</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}

                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Account ID</Label>
                  <Input
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}

                    className="mt-1 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">API Access Token</Label>
                <div className="relative mt-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}

                    className="text-sm font-mono pr-9"
                  />
                  <button onClick={() => setShowToken(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded">
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Generate di Omnichannel: Profile (kanan atas) → Access Token. Pakai user agent dengan permission penuh.
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold">Webhook Secret <span className="text-muted-foreground/70">(opsional, untuk security)</span></Label>
                <div className="relative mt-1">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}

                    className="text-sm font-mono pr-9"
                  />
                  <button onClick={() => setShowSecret(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Webhook URL display */}
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-900/60">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300 mb-1.5 flex items-center gap-1.5">
                <Webhook className="h-3.5 w-3.5" /> Webhook URL (paste di Omnichannel)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-card rounded px-2 py-1.5 border break-all">{webhookUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL disalin"); }}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Di Omnichannel: <strong>Settings → Integrations → Webhooks → Add new</strong>. Subscribe ke event <code className="font-mono bg-muted px-1 rounded">conversation_created</code> dan <code className="font-mono bg-muted px-1 rounded">message_created</code>.
              </p>
            </div>

            {/* Auto behaviors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-create tiket dari keyword</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Match message text dengan rules di bawah</div>
                </div>
                <ToggleSwitch checked={autoCreate} onChange={setAutoCreate} />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-notify ke Omnichannel saat tiket selesai</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Kirim private note ke conversation saat tiket di-resolve</div>
                </div>
                <ToggleSwitch checked={autoNotify} onChange={setAutoNotify} />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-sync kontak pelanggan (terjadwal)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Worker berkala push pelanggan baru/berubah jadi Chatwoot contact (perlu CHATWOOT_CONTACT_SYNC_ENABLED di server)</div>
                </div>
                <ToggleSwitch checked={autoSyncContacts} onChange={setAutoSyncContacts} />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Kategori Default <span className="text-muted-foreground/70">(fallback kalau ngga match keyword)</span></Label>
              <Select value={defaultCategoryId || "_none"} onValueChange={(v) => setDefaultCategoryId(v === "_none" ? "" : v)}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue placeholder="Pilih kategori default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Tidak ada (skip kalau ngga match)</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="flex-1">
                {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Simpan
              </Button>
              <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !isConfigured}>
                {testMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <TestTube className="h-4 w-4 mr-1.5" />}
                Test
              </Button>
            </div>

            {/* Keyword rules */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-bold">Keyword Rules</div>
                  <div className="text-[11px] text-muted-foreground">Match incoming message → kategori + priority. Comma-separated keywords (case insensitive).</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowRuleForm(s => !s)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Rule
                </Button>
              </div>

              {showRuleForm && (
                <div className="p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-2 mb-3">
                  <Input
                    value={ruleKeyword}
                    onChange={(e) => setRuleKeyword(e.target.value)}

                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Select value={ruleCategoryId} onValueChange={setRuleCategoryId}>
                      <SelectTrigger className="text-sm flex-1"><SelectValue placeholder="Kategori" /></SelectTrigger>
                      <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={rulePriority} onValueChange={setRulePriority}>
                      <SelectTrigger className="text-sm w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createRuleMut.mutate()} disabled={!ruleKeyword.trim() || !ruleCategoryId || createRuleMut.isPending} className="flex-1">
                      {createRuleMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Tambah Rule
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRuleForm(false)}>Batal</Button>
                  </div>
                </div>
              )}

              {rules.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4 italic">Belum ada rule. Tambah dengan tombol di atas.</div>
              ) : (
                <div className="space-y-1.5">
                  {rules.map((rule) => {
                    const cat = categories.find(c => c.id === rule.categoryId);
                    return (
                      <div key={rule.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                        <span className="font-mono text-xs text-muted-foreground w-6">#{rule.sortOrder}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{rule.keyword}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0 rounded" style={{ background: `${cat?.color}20`, color: cat?.color || undefined }}>
                              {cat?.name ?? `Cat #${rule.categoryId}`}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0 rounded uppercase tracking-wider font-bold ${
                              rule.priority === "urgent" ? "bg-rose-100 text-rose-700" :
                              rule.priority === "high" ? "bg-orange-100 text-orange-700" :
                              rule.priority === "low" ? "bg-zinc-100 text-zinc-600" :
                              "bg-blue-100 text-blue-700"
                            }`}>
                              {rule.priority}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Hapus rule "${rule.keyword.split(",")[0]}..."?`)) deleteRuleMut.mutate(rule.id); }} className="h-7">
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Help collapse */}
            <div className="border-t pt-3">
              <button onClick={() => setExpanded(s => !s)} className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
                <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Cara Setup di Omnichannel</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <GuideStep step={1} text="Login ke Omnichannel sebagai admin → Profile → Access Token (copy token)" />
                  <GuideStep step={2} text="Settings → Integrations → Webhooks → Add new webhook" />
                  <GuideStep step={3} text={`Paste URL: ${webhookUrl}`} />
                  <GuideStep step={4} text="Subscribe events: conversation_created, message_created (minimum)" />
                  <GuideStep step={5} text="Copy webhook secret yang Omnichannel generate, paste di field di atas" />
                  <GuideStep step={6} text="Save di JABNET, klik 'Test' untuk verify koneksi" />
                  <GuideStep step={7} text="Configure keyword rules - saat customer chat ada keyword 'gangguan' otomatis bikin tiket kategori Gangguan" />
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
