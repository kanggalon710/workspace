import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Check, Camera, Loader2, AlertTriangle, Edit3, Wifi, ScanLine, CheckCircle2, Star } from "lucide-react";

// v4.2.18 (B): wired panels for ticket detail
import { Customer360Panel } from "@/components/tickets/Customer360Panel";
import { AssetPanel } from "@/components/tickets/AssetPanel";
import { ActivityTimeline } from "@/components/tickets/ActivityTimeline";
import { TicketComments } from "@/components/tickets/TicketComments";
import { TicketActionToolbar } from "@/components/tickets/TicketActionToolbar";
import { ConfirmStageModal } from "@/components/tickets/ConfirmStageModal";
import { MultiPhotoUploader, DEFAULT_PHOTO_SLOTS } from "@/components/tickets/MultiPhotoUploader";
import { SignaturePad } from "@/components/tickets/SignaturePad";
import { ResolutionForm, type ResolutionData, type MaterialItem } from "@/components/tickets/ResolutionForm";
import { extractRawNote, fmtTimeIDN, fmtDateTimeIDN, fmtDuration, fmtSLA, getGpsPosition, compressImage, useLiveCountdown, StageDot, Label, Badge, PriorityBadge, CustomFieldRender, FieldCard, SpeedField, Metric, Activity14, type FieldType, type CustomFieldType, type CustomField, type WorkflowStage, type Ticket, type Transition, type Workflow, type EvidenceItem, type Customer, type Category } from "./shared";

export function StageExecutionScreen({ ticket, ticketId, stage, stageIdx, totalStages, category, mode, existingTransition, onBack, onComplete }: {
  ticket: Ticket;
  ticketId: string;
  stage: WorkflowStage;
  stageIdx: number;
  totalStages: number;
  category: Category | undefined;
  mode: "advance" | "edit";        // v4.2.7: advance = selesaikan stage, edit = koreksi data sudah selesai
  existingTransition?: Transition; // v4.2.7: data existing untuk pre-fill di edit mode
  onBack: () => void;
  onComplete: () => void;
}) {
  const qc = useQueryClient();
  const catColor = category?.color || "#1e40af";
  // v4.2.7: pre-fill dari existing transition metadata di edit mode
  const meta = existingTransition?.metadata ?? {};
  const isEdit = mode === "edit";

  const [photoIds, setPhotoIds] = useState<number[]>(() => existingTransition?.evidenceId ? [existingTransition.evidenceId] : []);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [numericValue, setNumericValue] = useState(() => meta.numeric?.toString() ?? "");
  const [barcodeValue, setBarcodeValue] = useState(() => meta.barcode?.toString() ?? "");
  // Notes: kalau edit, ambil dari meta.notes (tanpa serialized field) atau parse dari note
  const [notesValue, setNotesValue] = useState(() => meta.notes?.toString() ?? (isEdit && existingTransition?.note ? extractRawNote(existingTransition.note) : ""));
  const [checklistDone, setChecklistDone] = useState<Record<number, boolean>>(() => meta.checklist ?? {});
  const [signatureValue, setSignatureValue] = useState(() => meta.signature?.toString() ?? "");
  // v4.2.18 (B.5): tanda tangan canvas (data URL PNG) - disimpan di metadata.signatureImage
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>(() => meta.signatureImage?.toString() ?? "");
  const [speedDownload, setSpeedDownload] = useState(() => meta.speedDownload?.toString() ?? "");
  const [speedUpload, setSpeedUpload] = useState(() => meta.speedUpload?.toString() ?? "");
  const [speedLatency, setSpeedLatency] = useState(() => meta.speedLatency?.toString() ?? "");
  const [ratingValue, setRatingValue] = useState<number>(() => Number(meta.rating ?? 0));
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (existingTransition?.lat != null && existingTransition?.lng != null) {
      return { lat: existingTransition.lat, lng: existingTransition.lng };
    }
    return null;
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  // Custom fields values - keyed by field.key (pre-filled dari metadata.custom kalau edit)
  const [customValues, setCustomValues] = useState<Record<string, any>>(() => meta.custom ?? {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v4.2.18 (D): Resolution state - hanya dipakai di stage final
  const [resolutionData, setResolutionData] = useState<ResolutionData>(() => {
    let mat: MaterialItem[] = [];
    try { if (ticket.materialUsed) mat = JSON.parse(ticket.materialUsed); } catch {}
    return {
      resolutionCode: ticket.resolutionCode ?? "",
      resolution: ticket.resolution ?? "",
      materialUsed: mat,
    };
  });

  useEffect(() => {
    if (stage.fields?.includes("gps") && !gpsCoords) {
      setGpsLoading(true);
      getGpsPosition(10000).then(setGpsCoords).catch((e) => toast.error(e.message)).finally(() => setGpsLoading(false));
    }
  }, [stage.fields]);

  const checklistItems = useMemo<string[]>(() => {
    if (!ticket.checklist) return [];
    try {
      const parsed = JSON.parse(ticket.checklist);
      if (Array.isArray(parsed)) return parsed.map((p: any) => typeof p === "string" ? p : p.item ?? "").filter(Boolean);
    } catch {}
    return [];
  }, [ticket.checklist]);

  const evidenceMut = useMutation({
    mutationFn: async (data: { type: string; photoData: string }) => {
      let lat: number | null = null, lng: number | null = null;
      try { const pos = await getGpsPosition(8000); lat = pos.lat; lng = pos.lng; } catch {}
      return api.post<{ id: number }>(`/tickets/${ticket.id}/evidence`, { ...data, lat, lng });
    },
    onSuccess: (item: any) => {
      // CRITICAL: pakai ticketId (string) yang sama dengan queryKey original, BUKAN ticket.id (number)
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      const id = item?.id ?? item?.data?.id;
      if (id) setPhotoIds((arr) => [...arr, id]);
    },
    onError: (e: any) => toast.error(e.message || "Upload foto gagal"),
  });

  // Build metadata + display note (untuk completion summary di list)
  function buildPayload() {
    const metadata: Record<string, any> = {};
    if (notesValue.trim()) metadata.notes = notesValue.trim();
    if (numericValue) metadata.numeric = numericValue;
    if (barcodeValue) metadata.barcode = barcodeValue;
    if (signatureValue.trim()) metadata.signature = signatureValue.trim();
    if (signatureDataUrl) metadata.signatureImage = signatureDataUrl;
    if (speedDownload) metadata.speedDownload = speedDownload;
    if (speedUpload) metadata.speedUpload = speedUpload;
    if (speedLatency) metadata.speedLatency = speedLatency;
    if (ratingValue > 0) metadata.rating = ratingValue;
    if (Object.keys(checklistDone).length > 0) metadata.checklist = checklistDone;
    const cv: Record<string, any> = {};
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      if (v != null && v !== "" && v !== false) cv[cf.key] = v;
    }
    if (Object.keys(cv).length > 0) metadata.custom = cv;

    // Display note (single-line summary of fields, untuk preview di list timeline)
    const noteParts: string[] = [];
    if (notesValue.trim()) noteParts.push(notesValue.trim());
    if (numericValue) noteParts.push(`Pengukuran: ${numericValue}`);
    if (barcodeValue) noteParts.push(`Serial: ${barcodeValue}`);
    if (speedDownload && speedUpload) noteParts.push(`Speed: ${speedDownload}↓/${speedUpload}↑ Mbps`);
    if (signatureValue.trim()) noteParts.push(`TTD: ${signatureValue.trim()}`);
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      if (v == null || v === "" || v === false) continue;
      const display = cf.unit ? `${v} ${cf.unit}` : String(v);
      noteParts.push(`${cf.label}: ${display}`);
    }
    const completionNote = noteParts.join(" · ").slice(0, 500);

    return { metadata, completionNote };
  }

  const advanceMut = useMutation({
    mutationFn: () => {
      const { metadata, completionNote } = buildPayload();
      const body: any = {
        note: completionNote || undefined,
        evidenceId: photoIds[0],
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        forceAdvance: true,
      };
      if (stage.isFinal) {
        body.toStage = stage.key;
        // v4.2.18 (D): include resolution code + material when finalizing
        if (resolutionData.resolutionCode) body.resolutionCode = resolutionData.resolutionCode;
        if (resolutionData.resolution) body.resolution = resolutionData.resolution;
        if (resolutionData.materialUsed.length > 0) body.materialUsed = resolutionData.materialUsed;
      }
      return api.post(`/tickets/${ticket.id}/advance-stage`, body);
    },
    onSuccess: () => {
      toast.success(`✓ Stage "${stage.label}" selesai`);
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-workflow", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-workflow", ticketId] });
      onComplete();
    },
    onError: (e: any) => toast.error(e.message || "Gagal selesaikan stage"),
  });

  // v4.2.7: edit existing transition (untuk koreksi)
  const editMut = useMutation({
    mutationFn: () => {
      const { metadata, completionNote } = buildPayload();
      return api.put(`/tickets/${ticket.id}/stages/${stage.key}/transition`, {
        note: completionNote || null,
        evidenceId: photoIds[0] ?? null,
        lat: gpsCoords?.lat ?? null,
        lng: gpsCoords?.lng ?? null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });
    },
    onSuccess: () => {
      toast.success(`✓ Stage "${stage.label}" diperbarui`);
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-workflow", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-workflow", ticketId] });
      onComplete();
    },
    onError: (e: any) => toast.error(e.message || "Gagal update stage"),
  });

  async function handlePhotoCapture(file: File) {
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file, 1280, 0.72);
      setPhotoPreviews((arr) => [...arr, compressed]);
      await evidenceMut.mutateAsync({ type: `stage_${stage.key}`, photoData: compressed });
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
    } finally {
      setPhotoUploading(false);
    }
  }

  // v4.2.18 (B.8): konfirmasi modal sebelum submit (untuk advance/selesaikan stage)
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Build field summary untuk ConfirmStageModal
  function buildFieldSummary(): Array<{ label: string; value: string; type?: "text" | "photo" | "gps" | "signature"; filled: boolean }> {
    const required = stage.fields ?? [];
    const out: Array<{ label: string; value: string; type?: "text" | "photo" | "gps" | "signature"; filled: boolean }> = [];
    if (required.includes("photo")) {
      out.push({ label: "Foto Evidence", value: photoIds.length ? `${photoIds.length} foto terupload` : "-", type: "photo", filled: photoIds.length > 0 });
    }
    if (required.includes("numeric")) {
      out.push({ label: "Pengukuran (dBm)", value: numericValue || "-", type: "text", filled: !!numericValue });
    }
    if (required.includes("barcode")) {
      out.push({ label: "ONT Serial", value: barcodeValue || "-", type: "text", filled: !!barcodeValue });
    }
    if (required.includes("signature")) {
      const sigOk = !!(signatureValue.trim() && signatureDataUrl);
      out.push({ label: "TTD Pelanggan", value: signatureValue || "-", type: "signature", filled: sigOk });
    }
    if (required.includes("speedtest")) {
      out.push({ label: "Speed Test", value: speedDownload && speedUpload ? `${speedDownload}↓/${speedUpload}↑ Mbps` : "-", type: "text", filled: !!(speedDownload && speedUpload) });
    }
    if (required.includes("gps")) {
      out.push({ label: "GPS Lokasi", value: gpsCoords ? `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : "-", type: "gps", filled: !!gpsCoords });
    }
    if (required.includes("checklist")) {
      const total = checklistItems.length;
      const done = Object.values(checklistDone).filter(Boolean).length;
      out.push({ label: "Checklist", value: total ? `${done}/${total} item` : "-", type: "text", filled: total > 0 && done === total });
    }
    if (required.includes("rating")) {
      out.push({ label: "Rating", value: ratingValue ? `${ratingValue}/5 bintang` : "-", type: "text", filled: ratingValue > 0 });
    }
    if (notesValue.trim()) {
      out.push({ label: "Notes", value: notesValue.length > 60 ? notesValue.slice(0, 60) + "…" : notesValue, type: "text", filled: true });
    }
    // Custom fields
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      const display = v == null || v === "" ? "-" : (cf.type === "checkbox" ? (v ? "✓ Ya" : "Tidak") : (cf.unit ? `${v} ${cf.unit}` : String(v)));
      const filled = cf.type === "checkbox" ? !!v : (v != null && String(v).trim() !== "");
      out.push({ label: cf.label + (cf.required ? " *" : ""), value: display, type: "text", filled: !cf.required || filled });
    }
    return out;
  }

  function validateBeforeSubmit(): string | null {
    const required = stage.fields ?? [];
    if (required.includes("photo") && photoIds.length === 0) return "Minimal 1 foto evidence wajib";
    if (required.includes("numeric") && !numericValue) return "Pengukuran wajib diisi";
    if (required.includes("barcode") && !barcodeValue) return "Scan barcode wajib";
    if (required.includes("signature") && !signatureValue.trim()) return "Nama TTD pelanggan wajib";
    if (required.includes("signature") && !signatureDataUrl) return "Tanda tangan canvas wajib";
    if (required.includes("speedtest") && (!speedDownload || !speedUpload)) return "Speed test wajib diisi";
    for (const cf of (stage.customFields ?? [])) {
      if (!cf.required) continue;
      const v = customValues[cf.key];
      if (cf.type === "checkbox") {
        if (!v) return `"${cf.label}" wajib di-centang`;
      } else if (v == null || String(v).trim() === "") {
        return `"${cf.label}" wajib diisi`;
      }
    }
    // v4.2.18 (D.1): final stage wajib pilih kode resolusi
    if (stage.isFinal && !isEdit && !resolutionData.resolutionCode) {
      return "Kode resolusi wajib dipilih untuk menutup tiket";
    }
    return null;
  }

  function handleSubmit() {
    const err = validateBeforeSubmit();
    if (err) return toast.error(err);
    // v4.2.18 (B.8): kalau mode advance (selesaikan stage), tampilkan konfirmasi modal
    if (!isEdit) {
      setConfirmOpen(true);
      return;
    }
    // edit mode → langsung mutate (tanpa konfirmasi karena reversible)
    editMut.mutate();
  }

  function handleConfirmSubmit() {
    setConfirmOpen(false);
    advanceMut.mutate();
  }

  const submitting = advanceMut.isPending || editMut.isPending;

  return (
    /* technician-stage-execution: full-screen stage field-entry (advance/edit) */
    <div data-section="technician-stage-execution" className="min-h-screen flex flex-col" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div className="mx-auto w-full max-w-md md:max-w-3xl lg:max-w-5xl" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* ==== technician-stage-exec-header: colored stage title bar ==== */}
        <header data-section="technician-stage-exec-header" style={{ background: catColor, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ padding: 0, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{isEdit ? "Edit Stage" : "Stage"} {stageIdx + 1}/{totalStages}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{stage.label}</div>
          </div>
          <span style={{ padding: "3px 8px", background: "rgba(255,255,255,0.2)", borderRadius: 999, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            {isEdit ? "EDIT" : <><span style={{ width: 4, height: 4, borderRadius: 2, background: "#fff", animation: "pulse 1.5s infinite" }} /> ACTIVE</>}
          </span>
        </header>

        {/* Edit mode banner */}
        {isEdit && (
          <div style={{ padding: "10px 14px", background: "#fef3c7", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e", lineHeight: 1.4 }}>
            <strong>Mode Edit:</strong> Stage ini sudah diselesaikan. Koreksi data di bawah lalu tap <strong>"Update Stage"</strong>. Stage flow + durasi tidak berubah.
          </div>
        )}

        <div className="p-3.5 lg:p-6" style={{ flex: 1, overflow: "auto" }}>
          {stage.description && (
            <div className="bg-white" style={{ borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
              {stage.description}
            </div>
          )}

          {/* ==== technician-stage-fields: field-entry cards (photo/numeric/checklist/etc) ==== */}
          <div data-section="technician-stage-fields" className="lg:grid lg:grid-cols-2 lg:gap-3">



          {stage.fields?.includes("photo") && (
            <FieldCard icon={<Camera style={{ width: 14, height: 14 }} />} label="Foto Evidence" required hint={photoIds.length ? `${photoIds.length} foto` : "Min. 1 foto · multi-slot"}>
              <MultiPhotoUploader
                ticketId={ticket.id}
                slots={DEFAULT_PHOTO_SLOTS}
                onChange={(ids) => setPhotoIds(ids)}
              />
            </FieldCard>
          )}

          {stage.fields?.includes("numeric") && (
            <FieldCard icon={<Activity14 />} label="Pengukuran Redaman" required>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number" step="0.1" value={numericValue}
                  onChange={(e) => setNumericValue(e.target.value)}
                  placeholder="-21.4"
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}
                />
                <span style={{ padding: "8px 12px", background: "#f1f5f9", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>dBm</span>
              </div>
              {numericValue && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600 }}>
                  {parseFloat(numericValue) >= -25 && parseFloat(numericValue) <= -8 ? (
                    <span style={{ color: "#10b981" }}>● Normal range (-25 to -8 dBm)</span>
                  ) : (
                    <span style={{ color: "#f59e0b" }}>● Out of range</span>
                  )}
                </div>
              )}
            </FieldCard>
          )}

          {stage.fields?.includes("barcode") && (
            <FieldCard icon={<ScanLine style={{ width: 14, height: 14 }} />} label="Scan ONT Serial" required>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={barcodeValue}
                  onChange={(e) => setBarcodeValue(e.target.value.toUpperCase())}
                  placeholder="HWTC-XXXX-XXXX-XX"
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, textTransform: "uppercase" }}
                />
                {barcodeValue && (
                  <span style={{ padding: "8px 12px", background: "#d1fae5", borderRadius: 6, display: "flex", alignItems: "center" }}>
                    <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} />
                  </span>
                )}
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("speedtest") && (
            <FieldCard icon={<Wifi style={{ width: 14, height: 14 }} />} label="Speed Test" required>
              <div style={{ background: "#0f172a", color: "#fff", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <SpeedField label="Download" value={speedDownload} onChange={setSpeedDownload} unit="Mbps" color="#10b981" />
                <SpeedField label="Upload" value={speedUpload} onChange={setSpeedUpload} unit="Mbps" color="#0ea5e9" />
                <SpeedField label="Latency" value={speedLatency} onChange={setSpeedLatency} unit="ms" color="#fff" />
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("checklist") && checklistItems.length > 0 && (
            <FieldCard icon={<CheckCircle2 style={{ width: 14, height: 14 }} />} label="Checklist" required hint={`${Object.values(checklistDone).filter(Boolean).length}/${checklistItems.length}`}>
              {checklistItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setChecklistDone((s) => ({ ...s, [i]: !s[i] }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "8px 4px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                  className="active:bg-slate-50"
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: checklistDone[i] ? "#10b981" : "#fff",
                    border: `2px solid ${checklistDone[i] ? "#10b981" : "#cbd5e1"}`,
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    {checklistDone[i] && <Check style={{ width: 12, height: 12, color: "#fff" }} strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: 13, color: checklistDone[i] ? "#94a3b8" : "#0f172a", textDecoration: checklistDone[i] ? "line-through" : "none" }}>{item}</span>
                </button>
              ))}
            </FieldCard>
          )}

          {stage.fields?.includes("gps") && (
            <FieldCard icon={<MapPin style={{ width: 14, height: 14 }} />} label="GPS Location" required hint={gpsCoords ? "Captured" : "Auto"}>
              <div style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12,
                display: "flex", alignItems: "center", gap: 10,
                background: gpsCoords ? "#d1fae5" : gpsLoading ? "#e0f2fe" : "#fef3c7",
                border: `1px solid ${gpsCoords ? "#a7f3d0" : gpsLoading ? "#bae6fd" : "#fde68a"}`,
              }}>
                {gpsLoading ? <Loader2 style={{ width: 14, height: 14, color: "#0ea5e9" }} className="animate-spin" /> :
                 gpsCoords ? <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} /> :
                 <AlertTriangle style={{ width: 14, height: 14, color: "#f59e0b" }} />}
                <span style={{ flex: 1, color: "#0f172a" }}>
                  {gpsLoading ? "Mengambil GPS..." :
                   gpsCoords ? <span className="jbn-mono jbn-tabular">{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</span> :
                   "GPS belum aktif"}
                </span>
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("signature") && (
            <FieldCard icon={<Edit3 style={{ width: 14, height: 14 }} />} label="TTD Pelanggan" required>
              <input
                value={signatureValue}
                onChange={(e) => setSignatureValue(e.target.value)}
                placeholder="Nama lengkap pelanggan"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, marginBottom: 8 }}
              />
              <SignaturePad
                onSave={(dataUrl) => setSignatureDataUrl(dataUrl)}
                initialDataUrl={signatureDataUrl || undefined}
                hint="Tanda tangan pelanggan di sini"
                required
              />
            </FieldCard>
          )}

          {stage.fields?.includes("rating") && (
            <FieldCard icon={<Star style={{ width: 14, height: 14 }} />} label="Rating Pelanggan" hint="Optional">
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRatingValue(n)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 6,
                      border: `1px solid ${n <= ratingValue ? "#f59e0b" : "#e2e8f0"}`,
                      background: n <= ratingValue ? "#fef3c7" : "#fff",
                      cursor: "pointer", display: "grid", placeItems: "center",
                    }}
                    className="active:scale-95 transition-transform"
                  >
                    <Star style={{ width: 16, height: 16, color: n <= ratingValue ? "#f59e0b" : "#cbd5e1", fill: n <= ratingValue ? "#f59e0b" : "transparent" }} />
                  </button>
                ))}
              </div>
            </FieldCard>
          )}

          <FieldCard icon={<Edit3 style={{ width: 14, height: 14 }} />} label="Notes" hint={stage.fields?.includes("notes") ? "" : "Optional"}>
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Catatan tambahan untuk stage ini..."
              rows={3}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "none" }}
            />
          </FieldCard>

          {/* v4.2.7: Custom fields - admin-defined per stage */}
          {(stage.customFields ?? []).map((cf) => (
            <CustomFieldRender
              key={cf.key}
              field={cf}
              value={customValues[cf.key]}
              onChange={(v) => setCustomValues((s) => ({ ...s, [cf.key]: v }))}
            />
          ))}
          </div>
          {/* end fields grid */}

          {/* ==== technician-resolution: final-stage resolution code + material form ==== */}
          {stage.isFinal && !isEdit && (
            <div data-section="technician-resolution" className="mt-3">
              <div className="rounded-md border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4 mb-3">
                <div className="flex items-start gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-emerald-900">Stage Final - Penyelesaian Tiket</div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Isi kode resolusi & material sebelum tiket ditutup. Data ini akan masuk ke BAST yang bisa di-print.
                    </div>
                  </div>
                </div>
              </div>
              <ResolutionForm
                initial={resolutionData}
                onChange={setResolutionData}
              />
            </div>
          )}
        </div>

        {/* ==== technician-stage-actions: cancel + submit/update stage buttons ==== */}
        <div data-section="technician-stage-actions" style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: 12, display: "flex", gap: 8 }}>
          <button
            onClick={onBack}
            disabled={advanceMut.isPending}
            style={{ padding: "12px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || photoUploading}
            style={{
              flex: 1, padding: 12,
              background: isEdit ? "#1e40af" : "#10b981",   // edit: navy, advance: emerald
              color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : <Check style={{ width: 15, height: 15 }} strokeWidth={3} />}
            {isEdit ? "Update Stage" : "Selesaikan Stage"}
          </button>
        </div>
      </div>

      {/* v4.2.18 (B.8): Konfirmasi sebelum selesaikan stage (irreversible by helper) */}
      <ConfirmStageModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        stageName={stage.label}
        stageDescription={stage.description}
        fields={buildFieldSummary()}
        isFinalStage={!!stage.isFinal}
        isPending={advanceMut.isPending}
      />
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

