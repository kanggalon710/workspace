/**
 * Marketing Ads - Audience Export & ODP Clustering Utilities
 * Generates Meta/TikTok-compatible audience files + geo-target clusters
 */
import crypto from "crypto";

// -- SHA-256 Hashing (Meta/TikTok requirement) --

export function hashSHA256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function formatPhoneE164(phone: string): string {
  let clean = phone.replace(/[\s\-\(\)\.]/g, "");
  // Indonesian numbers
  if (clean.startsWith("08")) clean = "+62" + clean.slice(1);
  else if (clean.startsWith("62")) clean = "+" + clean;
  else if (!clean.startsWith("+")) clean = "+62" + clean;
  return clean;
}

// -- Audience CSV Generation --

export interface AudienceRow {
  email: string;  // SHA-256
  phone: string;  // SHA-256 of E.164
  fn: string;     // SHA-256
  ln: string;     // SHA-256
  ct: string;     // SHA-256
  country: string; // SHA-256
  value?: string;  // numeric, not hashed
}

function splitName(fullName: string): { fn: string; ln: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { fn: parts[0] || "", ln: "" };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

export function customerToAudienceRow(c: {
  name: string; phone?: string | null; email?: string | null;
  district?: string | null; billingPrice?: number | null;
}, includeValue = false): AudienceRow {
  const { fn, ln } = splitName(c.name || "");
  return {
    email: c.email ? hashSHA256(c.email) : "",
    phone: c.phone ? hashSHA256(formatPhoneE164(c.phone)) : "",
    fn: fn ? hashSHA256(fn) : "",
    ln: ln ? hashSHA256(ln) : "",
    ct: c.district ? hashSHA256(c.district.toLowerCase()) : "",
    country: hashSHA256("id"),
    ...(includeValue && c.billingPrice ? { value: String(c.billingPrice) } : {}),
  };
}

export function audienceToCSV(rows: AudienceRow[], includeValue = false): string {
  const headers = includeValue
    ? "email,phone,fn,ln,ct,country,value"
    : "email,phone,fn,ln,ct,country";
  const lines = rows
    .filter(r => r.email || r.phone) // Must have at least 1 identifier
    .map(r => includeValue
      ? `${r.email},${r.phone},${r.fn},${r.ln},${r.ct},${r.country},${r.value || ""}`
      : `${r.email},${r.phone},${r.fn},${r.ln},${r.ct},${r.country}`
    );
  return [headers, ...lines].join("\n");
}

// -- Haversine Distance (meters) --

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -- ODP Clustering --

export interface OdpForCluster {
  id: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  usedCapacity: number;
  district?: string | null;
}

export interface OdpCluster {
  clusterName: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  odpCount: number;
  portKosong: number;
  portTotal: number;
  utilisasi: number; // percentage
  budgetRecommendation: number;
  district: string;
  odpList: string[];
  priority: "high" | "medium" | "low" | "skip";
}

const TARGET_CPL = 30000; // Rp 30.000 per lead
const LEADS_PER_CUSTOMER = 5; // 20% conversion rate assumption

export function clusterOdps(odps: OdpForCluster[], clusterRadiusM = 500): OdpCluster[] {
  const valid = odps.filter(o => o.lat && o.lng && o.lat !== 0 && o.lng !== 0);
  const assigned = new Set<number>();
  const clusters: OdpCluster[] = [];

  // Sort by latitude for spatial locality
  const sorted = [...valid].sort((a, b) => a.lat - b.lat);

  for (const odp of sorted) {
    if (assigned.has(odp.id)) continue;

    // Start new cluster
    const members: OdpForCluster[] = [odp];
    assigned.add(odp.id);

    // Find nearby unassigned ODPs
    for (const candidate of sorted) {
      if (assigned.has(candidate.id)) continue;
      const dist = haversineDistance(odp.lat, odp.lng, candidate.lat, candidate.lng);
      if (dist <= clusterRadiusM) {
        members.push(candidate);
        assigned.add(candidate.id);
      }
    }

    // Calculate cluster center (centroid)
    const centerLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const centerLng = members.reduce((s, m) => s + m.lng, 0) / members.length;

    // Calculate radius: max distance from center to any member + 500m buffer
    let maxDist = 0;
    for (const m of members) {
      const d = haversineDistance(centerLat, centerLng, m.lat, m.lng);
      if (d > maxDist) maxDist = d;
    }
    const radiusKm = Math.max((maxDist + 500) / 1000, 1.6); // Minimum 1.6km (1 mile = Meta minimum)

    // Capacity stats
    const portTotal = members.reduce((s, m) => s + (m.capacity || 8), 0);
    const portUsed = members.reduce((s, m) => s + (m.usedCapacity || 0), 0);
    const portKosong = portTotal - portUsed;
    const utilisasi = portTotal > 0 ? Math.round((portUsed / portTotal) * 100) : 0;

    // Budget recommendation
    const budgetRecommendation = portKosong * TARGET_CPL * LEADS_PER_CUSTOMER;

    // Priority based on utilization
    let priority: "high" | "medium" | "low" | "skip";
    if (utilisasi >= 100 || portKosong <= 0) priority = "skip";
    else if (utilisasi >= 75) priority = "low";
    else if (utilisasi >= 50) priority = "medium";
    else priority = "high";

    // District: most common among members
    const districtCounts: Record<string, number> = {};
    for (const m of members) {
      const d = m.district || "Unknown";
      districtCounts[d] = (districtCounts[d] || 0) + 1;
    }
    const district = Object.entries(districtCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    const clusterIdx = clusters.filter(c => c.district === district).length + 1;

    clusters.push({
      clusterName: `${district} - Cluster ${String.fromCharCode(64 + clusterIdx)}`,
      centerLat, centerLng, radiusKm,
      odpCount: members.length,
      portKosong, portTotal, utilisasi,
      budgetRecommendation,
      district,
      odpList: members.map(m => m.name),
      priority,
    });
  }

  // Sort: high priority first, then by port kosong descending
  clusters.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2, skip: 3 };
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (diff !== 0) return diff;
    return b.portKosong - a.portKosong;
  });

  return clusters;
}
