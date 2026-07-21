import React from "react";
import { Pencil, Link2, MapPin, CircleDot, Radio, Box, Users, Landmark, Cable, X } from "lucide-react";
import { ASSET_COLORS, odpUsageColor } from "@/lib/assetColors";

interface MapInfoWindowProps {
  type: string;
  data: any;
  onClose: () => void;
  onEdit?: () => void;
  onDetail?: () => void;
  onViewList?: () => void;
  onConnect?: () => void;
  onViewCableDetail?: () => void;
  onAddAssetAtCable?: (type: "odp" | "odc" | "pole") => void;
  onAddCustomerDrop?: () => void;
}

// -- Helpers ---------------------------------------------------------------

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: mono ? "monospace" : undefined, color: "#111827" }}>{value}</span>
    </div>
  );
}

function PortBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(Math.round((used / total) * 100), 100) : 0;
  const free = total - used;
  return (
    <div style={{ margin: "10px 0" }}>
      {/* Label row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Port Usage</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct}%</span>
      </div>
      {/* Bar */}
      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: 8, width: `${pct}%`, background: color, borderRadius: 6, transition: "width 400ms ease" }} />
      </div>
      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          <strong style={{ color: "#111827" }}>{used}</strong> terpakai
        </span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          <strong style={{ color }}>{free}</strong> kosong dari <strong style={{ color: "#111827" }}>{total}</strong>
        </span>
      </div>
    </div>
  );
}

function GenericBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(Math.round((used / total) * 100), 100) : 0;
  const color = pct >= 90 ? "#EF4444" : pct >= 70 ? "#F59E0B" : "#22C55E";
  return (
    <div style={{ margin: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: 8, width: `${pct}%`, background: color, borderRadius: 6, transition: "width 400ms ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}><strong style={{ color: "#111827" }}>{used}</strong> / <strong style={{ color: "#111827" }}>{total}</strong></span>
        <span style={{ fontSize: 11, color }}>{pct < 100 ? `${total - used} tersisa` : "Penuh"}</span>
      </div>
    </div>
  );
}

const TYPE_META: Record<string, { abbr: string; colorKey: keyof typeof ASSET_COLORS; Icon: any }> = {
  pop:      { abbr: "POP", colorKey: "pop",      Icon: Radio },
  odc:      { abbr: "ODC", colorKey: "odc",      Icon: Box },
  odp:      { abbr: "ODP", colorKey: "odp",      Icon: CircleDot },
  customer: { abbr: "PLG", colorKey: "customer", Icon: Users },
  pole:     { abbr: "TNG", colorKey: "pole",     Icon: Landmark },
  cable:    { abbr: "KBL", colorKey: "cable",    Icon: Cable },
};

// -- Main ------------------------------------------------------------------
export function MapInfoWindowContent({
  type, data, onClose, onEdit, onConnect, onViewCableDetail, onAddAssetAtCable, onAddCustomerDrop,
}: MapInfoWindowProps) {
  const meta = TYPE_META[type];
  if (!meta) return null;

  const baseColor = ASSET_COLORS[meta.colorKey]?.primary ?? "#6b7280";
  const statusActive = data.status === "active" || !data.status;

  // ODP-specific usage
  const odpUsed: number = data._usedPorts ?? data.usedCapacity ?? 0;
  const odpCap: number  = data.capacity ?? 0;
  const odpPct: number  = odpCap > 0 ? Math.min(Math.round((odpUsed / odpCap) * 100), 100) : 0;
  const { color: usageColor, label: usageLabel } = odpUsageColor(odpPct);
  const accentColor = type === "odp" ? usageColor : baseColor;

  const containerStyle: React.CSSProperties = {
    width: 300,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    background: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>

      {/* -- Accent stripe -- */}
      <div style={{ height: 4, background: accentColor, width: "100%" }} />

      {/* -- Header -- */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {/* Type badge circle */}
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: accentColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, color: "white", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
          }}>
            {meta.abbr}
          </div>
          {/* Name & subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3, wordBreak: "break-word" }}>
              {data.name}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
              {type === "odp" && (
                <span style={{ fontSize: 10, fontWeight: 600, color: usageColor }}>{usageLabel}</span>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                background: statusActive ? "#dcfce7" : "#fee2e2",
                color: statusActive ? "#16a34a" : "#dc2626",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {statusActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </div>
          {/* Close button - replaces native Google Maps X */}
          {onClose && (
            <button onClick={onClose} style={{
              width: 26, height: 26, borderRadius: "50%", border: "none",
              background: "rgba(0,0,0,0.08)", color: "#374151", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginLeft: 4,
            }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* -- Body -- */}
      <div style={{ padding: "10px 14px" }}>

        {/* POP */}
        {type === "pop" && (
          <>
            <InfoRow label="Kode" value={data.code} mono />
            <InfoRow label="Alamat" value={data.address} />
            <GenericBar used={data.usedPorts || 0} total={data.totalPorts || 0} label="Port Usage" />
          </>
        )}

        {/* ODC */}
        {type === "odc" && (
          <>
            <InfoRow label="Kode" value={data.code} mono />
            <InfoRow label="Splitter" value={data.splitterType} />
            <GenericBar used={data.usedCapacity || 0} total={data.capacity || 0} label="Kapasitas" />
          </>
        )}

        {/* ODP */}
        {type === "odp" && (
          <>
            <InfoRow label="Kode" value={data.code} mono />
            <InfoRow label="Splitter" value={data.splitterType} />
            <PortBar used={odpUsed} total={odpCap} color={usageColor} />

            {/* Connected customers */}
            {(data.connectedCustomers || []).length > 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>
                  Pelanggan Terhubung ({data.connectedCustomers.length})
                </p>
                <div style={{ maxHeight: 96, overflowY: "auto", background: "#f9fafb", borderRadius: 8, padding: "4px 0" }}>
                  {data.connectedCustomers.map((c: any, i: number) => (
                    <div key={c.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "5px 10px",
                      borderBottom: i < data.connectedCustomers.length - 1 ? "1px solid #f3f4f6" : undefined,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9ca3af", marginLeft: 8, flexShrink: 0 }}>{c.customerId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Customer */}
        {type === "customer" && (
          <>
            <InfoRow label="ID Pelanggan" value={data.customerId} mono />
            <InfoRow label="Paket" value={data.package} />
            <InfoRow label="Telepon" value={data.phone} />
            <InfoRow label="Alamat" value={data.address} />
          </>
        )}

        {/* Tiang */}
        {type === "pole" && (
          <>
            <InfoRow label="Kode" value={data.code} mono />
            <InfoRow label="Tipe" value={data.type} />
            <InfoRow label="Tinggi" value={data.height ? `${data.height} m` : null} />
            <InfoRow label="Material" value={data.material} />
          </>
        )}

        {/* Kabel */}
        {type === "cable" && (
          <>
            <InfoRow label="Kode" value={data.code} mono />
            <InfoRow label="Tipe" value={data.cableType} />
            <InfoRow label="Panjang" value={data.lengthMeters ? `${data.lengthMeters} m` : null} />
            <GenericBar used={data.usedCore || 0} total={data.totalCore || 0} label="Core Usage" />
            <InfoRow label="Tube" value={`${data.usedTube || 0} / ${data.totalTube || 0}`} />
          </>
        )}

        {/* Coordinates */}
        {data.lat && data.lng && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
            <MapPin size={11} color="#9ca3af" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9ca3af" }}>
              {Number(data.lat).toFixed(6)}, {Number(data.lng).toFixed(6)}
            </span>
          </div>
        )}
      </div>

      {/* -- Footer -- */}
      <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 8 }}>
        {type !== "cable" && onEdit && (
          <button onClick={onEdit} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb",
            background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer",
            flex: "0 0 auto",
          }}>
            <Pencil size={12} /> Edit
          </button>
        )}
        {onConnect && (
          <button onClick={onConnect} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb",
            background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer",
            flex: 1,
          }}>
            <Link2 size={12} /> Hubungkan
          </button>
        )}
        {type === "odp" && onAddCustomerDrop && (
          <button onClick={onAddCustomerDrop} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8, border: "none",
            background: accentColor, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer",
            flex: 1,
          }}>
            <Link2 size={12} /> Tarik Kabel Pelanggan
          </button>
        )}
        {type === "cable" && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            {onViewCableDetail && (
              <button onClick={onViewCableDetail} style={{
                fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "none",
                border: "none", cursor: "pointer", textAlign: "left", padding: 0,
              }}>
                Lihat Detail Core →
              </button>
            )}
            {onAddAssetAtCable && (
              <>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tambah di jalur ini:</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["odp", "odc", "pole"] as const).map((t) => (
                    <button key={t} onClick={() => onAddAssetAtCable(t)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 8, border: "none",
                      background: ASSET_COLORS[t].primary, color: "white",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>
                      + {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
