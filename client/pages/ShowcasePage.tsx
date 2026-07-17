import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { FormField, FormRow, FormSection } from "@/components/ui/form-field";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Layers, Users, TrendingUp, AlertTriangle, CheckCircle2, Mail,
  Radio, Box, CircleDot, Wrench, Search, Plus, Download,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

// ── Mock data for DataTable demo ──
const mockUsers = [
  { id: 1, name: "Ahmad Maulana", email: "ahmad@jabnet.id", role: "Admin", status: "active", lastLogin: "2 jam lalu" },
  { id: 2, name: "Sri Rahayu", email: "sri@jabnet.id", role: "Marketing", status: "active", lastLogin: "5 jam lalu" },
  { id: 3, name: "Budi Santoso", email: "budi@jabnet.id", role: "Operator", status: "active", lastLogin: "1 hari lalu" },
  { id: 4, name: "Dewi Kartika", email: "dewi@jabnet.id", role: "Viewer", status: "inactive", lastLogin: "3 hari lalu" },
  { id: 5, name: "Eko Prasetyo", email: "eko@jabnet.id", role: "Teknisi", status: "active", lastLogin: "Baru saja" },
  { id: 6, name: "Fitria Nur", email: "fitria@jabnet.id", role: "Marketing", status: "active", lastLogin: "30 menit lalu" },
  { id: 7, name: "Galih Putra", email: "galih@jabnet.id", role: "Operator", status: "inactive", lastLogin: "1 minggu lalu" },
  { id: 8, name: "Hanifah Zulfa", email: "hanifah@jabnet.id", role: "Admin", status: "active", lastLogin: "1 jam lalu" },
  { id: 9, name: "Indra Kurnia", email: "indra@jabnet.id", role: "Teknisi", status: "active", lastLogin: "4 jam lalu" },
  { id: 10, name: "Joko Widianto", email: "joko@jabnet.id", role: "Viewer", status: "active", lastLogin: "kemarin" },
];

// ── Mock ODPs for Combobox demo ──
const mockOdps: ComboboxOption[] = [
  { value: "odp-001", label: "ODP-CLW-001", description: "Cilawu · 8 port terpakai", icon: <CircleDot className="h-3.5 w-3.5 text-asset-odp" /> },
  { value: "odp-002", label: "ODP-CLW-002", description: "Cilawu · 12 port terpakai", icon: <CircleDot className="h-3.5 w-3.5 text-asset-odp" /> },
  { value: "odp-003", label: "ODP-GRT-001", description: "Garut Kota · 4 port terpakai", icon: <CircleDot className="h-3.5 w-3.5 text-asset-odp" /> },
  { value: "odp-004", label: "ODP-TRG-001", description: "Tarogong · 16 port terpakai", icon: <CircleDot className="h-3.5 w-3.5 text-asset-odp" /> },
  { value: "odp-005", label: "ODP-TRG-002", description: "Tarogong · Penuh", icon: <CircleDot className="h-3.5 w-3.5 text-asset-odp" />, disabled: true },
];

const customerSchema = z.object({
  name: z.string().min(3, "Minimal 3 karakter"),
  email: z.string().email("Email tidak valid"),
  phone: z.string().min(10, "Nomor minimal 10 digit").regex(/^[0-9+\-\s]+$/, "Hanya angka"),
  odpId: z.string().min(1, "Pilih ODP"),
});

export default function ShowcasePage() {
  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    phone: "",
    odpId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedOdp, setSelectedOdp] = useState<string>("");
  const [showEmpty, setShowEmpty] = useState(false);

  const columns: ColumnDef<typeof mockUsers[0]>[] = [
    {
      accessorKey: "name",
      header: "Nama",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {row.original.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{row.original.name}</div>
            <div className="text-xs text-muted-foreground truncate">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-foreground">
          {row.original.role}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          variant={row.original.status === "active" ? "success" : "neutral"}
          label={row.original.status === "active" ? "Aktif" : "Nonaktif"}
          size="sm"
        />
      ),
    },
    {
      accessorKey: "lastLogin",
      header: "Login Terakhir",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lastLogin}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: () => (
        <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
          Detail →
        </Button>
      ),
    },
  ];

  const handleSubmit = () => {
    const result = customerSchema.safeParse(formValues);
    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) newErrors[String(err.path[0])] = err.message;
      });
      setErrors(newErrors);
      toast.error("Form masih ada kesalahan");
      return;
    }
    setErrors({});
    toast.success("Form valid! Data siap di-submit.");
  };

  return (
    <PageContainer>
      <PageHeader
        icon={Sparkles}
        title="Phase 2 — Component Showcase"
        description="Preview komponen enterprise baru: Command Palette, DataTable, FormField + zod, Combobox"
        accent="violet"
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Download />}>
              Export
            </Button>
            <Button variant="gradient" size="sm" leftIcon={<Plus />}>
              Tambah Baru
            </Button>
          </>
        }
      />

      {/* ─── Quick Demo Banner ─── */}
      <Card variant="gradient" padding="md" className="mb-2">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground">Coba Command Palette</h3>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Tekan <kbd className="px-1.5 py-0.5 rounded bg-background border border-border/60 font-mono-tight text-2xs">⌘ K</kbd> (macOS) atau <kbd className="px-1.5 py-0.5 rounded bg-background border border-border/60 font-mono-tight text-2xs">Ctrl K</kbd> (Windows) untuk buka pencarian global.
              Atau klik icon search di TopBar.
            </p>
          </div>
        </div>
      </Card>

      {/* ─── StatTile Demo ─── */}
      <PageSection title="StatTile Variants" description="KPI card dengan semantic accent, trend indicator, dan loading state.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            icon={Users}
            label="Total Pelanggan"
            value="1,284"
            description="dari 2,000 kapasitas"
            trend={{ value: 12, label: "vs bulan lalu" }}
            accent="primary"
          />
          <StatTile
            icon={CheckCircle2}
            label="Pelanggan Aktif"
            value="1,178"
            description="92% retention rate"
            trend={{ value: 3, direction: "up" }}
            accent="success"
          />
          <StatTile
            icon={AlertTriangle}
            label="Isolir"
            value="73"
            description="butuh follow-up"
            trend={{ value: 8, direction: "up", invertColor: true }}
            accent="warning"
          />
          <StatTile
            icon={TrendingUp}
            label="ARPU"
            value="Rp 285K"
            description="average per user"
            trend={{ value: 5, direction: "up" }}
            accent="info"
          />
        </div>
      </PageSection>

      {/* ─── DataTable Demo ─── */}
      <PageSection
        title="DataTable"
        description="Sortable columns, global search, pagination. Built on @tanstack/react-table."
        actions={
          <Button size="sm" variant="outline" onClick={() => setShowEmpty((v) => !v)}>
            {showEmpty ? "Show Data" : "Show Empty"}
          </Button>
        }
      >
        <DataTable
          columns={columns}
          data={showEmpty ? [] : mockUsers}
          searchPlaceholder="Cari nama, email, role..."
          initialPageSize={10}
          onRowClick={(row) => toast.info(`Klik baris: ${row.name}`)}
          emptyTitle="Belum ada user"
          emptyDescription="Tambahkan user pertama untuk mulai kelola akses."
        />
      </PageSection>

      {/* ─── FormField + Combobox Demo ─── */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <Card padding="lg">
          <CardHeader>
            <CardTitle>Form dengan Zod Schema</CardTitle>
            <CardDescription>
              FormField wrapper + zod validation. Error muncul di submit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormSection>
              <FormField
                label="Nama Lengkap"
                htmlFor="demo-name"
                required
                error={errors.name}
                hint="Sesuai identitas KTP"
              >
                <Input
                  id="demo-name"
                  placeholder="Masukkan nama"
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  error={!!errors.name}
                />
              </FormField>

              <FormRow cols={2}>
                <FormField label="Email" htmlFor="demo-email" required error={errors.email}>
                  <Input
                    id="demo-email"
                    type="email"
                    leftIcon={<Mail />}
                    placeholder="nama@domain.com"
                    value={formValues.email}
                    onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                    error={!!errors.email}
                  />
                </FormField>
                <FormField label="No. HP" htmlFor="demo-phone" required error={errors.phone}>
                  <Input
                    id="demo-phone"
                    placeholder="08xxxxxxxxxx"
                    value={formValues.phone}
                    onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                    error={!!errors.phone}
                  />
                </FormField>
              </FormRow>

              <FormField
                label="ODP Tujuan"
                required
                error={errors.odpId}
                hint="Pilih ODP yang masih ada slot port kosong"
              >
                <Combobox
                  options={mockOdps}
                  value={formValues.odpId}
                  onChange={(v) => setFormValues({ ...formValues, odpId: v })}
                  placeholder="Pilih ODP..."
                  searchPlaceholder="Cari nama atau kecamatan..."
                  error={!!errors.odpId}
                />
              </FormField>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSubmit} variant="gradient" className="flex-1">
                  Submit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFormValues({ name: "", email: "", phone: "", odpId: "" });
                    setErrors({});
                  }}
                >
                  Reset
                </Button>
              </div>
            </FormSection>
          </CardContent>
        </Card>

        <Card padding="lg">
          <CardHeader>
            <CardTitle>Combobox (Searchable Select)</CardTitle>
            <CardDescription>
              Fuzzy search, icon support, description, keyboard navigasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Demo Pilih ODP" hint="Coba ketik 'CLW' atau 'Tarogong'">
              <Combobox
                options={mockOdps}
                value={selectedOdp}
                onChange={setSelectedOdp}
                placeholder="Pilih ODP..."
                searchPlaceholder="Cari ODP..."
              />
            </FormField>
            {selectedOdp && (
              <div className="text-xs p-3 rounded-md bg-success/10 border border-success/20 text-success">
                ✓ Selected: <span className="font-mono-tight font-semibold">{selectedOdp}</span>
              </div>
            )}

            <div className="pt-4 border-t border-border/60 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Button Variants Baru
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button variant="gradient" size="sm">Gradient</Button>
                <Button variant="outline-primary" size="sm">Outline Primary</Button>
                <Button variant="success" size="sm">Success</Button>
                <Button variant="warning" size="sm">Warning</Button>
                <Button variant="ghost-primary" size="sm">Ghost Primary</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="gradient" size="xs" leftIcon={<Plus />}>XS</Button>
                <Button variant="gradient" size="sm">SM</Button>
                <Button variant="gradient" size="default">Default</Button>
                <Button variant="gradient" size="lg">Large</Button>
                <Button variant="gradient" size="xl">XL</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button loading>Loading...</Button>
                <Button disabled>Disabled</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── StatusBadge Matrix ─── */}
      <PageSection title="StatusBadge Variants" description="Semantic status indicators untuk row/table/card states.">
        <Card padding="lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["success", "warning", "danger", "info", "neutral", "pending"] as const).map((v) => (
              <div key={v} className="space-y-2">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{v}</p>
                <div className="flex flex-col gap-1.5 items-start">
                  <StatusBadge variant={v} label="Subtle" />
                  <StatusBadge variant={v} label="Solid" appearance="solid" />
                  <StatusBadge variant={v} label="Outline" appearance="outline" />
                  <StatusBadge variant={v} label="Dot style" appearance="dot" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageSection>

      {/* ─── EmptyState Demo ─── */}
      <PageSection title="EmptyState Variants">
        <div className="grid md:grid-cols-2 gap-4">
          <Card padding="none">
            <EmptyState
              icon={Users}
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan pertama untuk mulai pipeline billing & monitoring."
              action={{ label: "Tambah Pelanggan", onClick: () => toast.success("Buka dialog...") }}
              secondaryAction={{ label: "Import CSV", onClick: () => toast.info("Upload CSV") }}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="warning"
              icon={AlertTriangle}
              title="ODP Kritis Terdeteksi"
              description="3 ODP mencapai kapasitas > 80%. Segera rencanakan split port tambahan."
              action={{ label: "Lihat ODP", onClick: () => toast.info("Navigate") }}
              size="sm"
            />
          </Card>
        </div>
      </PageSection>
    </PageContainer>
  );
}
