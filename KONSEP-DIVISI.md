# Konsep Workspace Berbasis Divisi - v5.1

> Restrukturisasi besar (Juli 2026, feedback owner): dashboard global **dihapus**,
> workspace disusun ulang per **divisi**. Tiap divisi punya "rumah" sendiri
> (hub + dashboard laporan), user melihat divisi sesuai izinnya + Teamspace.
> Sumber kebenaran struktur: `client/lib/divisions.ts` (Sidebar, Beranda, dan
> hub divisi semuanya digerakkan dari satu file ini).

## Prinsip

1. **Per-divisi, bukan per-fitur** - staf marketing membuka workspace dan hanya
   melihat: `Marketing` + `Teamspace` (+ Pipelines/menu umum bila diberi izin).
2. **Beranda = pintu masuk** (`/`) - role dengan divisi utama langsung diarahkan
   ke hub divisinya (mapping `ROLE_HOME_DIVISION`); admin/lintas-divisi melihat
   grid semua divisi.
3. **Hub divisi** (`/divisi/:key`) - KPI relevan (dari endpoint existing,
   permission-aware) + grid modul + pintasan divisi lain.
4. **Menu umum terpisah** - `Pipelines` berdiri sendiri; `Integrasi & Tools`
   menampung yang lintas divisi (Pengumuman, Bug, Integrasi API, Public API,
   Kelola Mitra, Manajemen Role).

## Peta Divisi → Modul

| Divisi | Key | Modul |
|---|---|---|
| Marketing | `marketing` | Dashboard Marketing, Canvassing, Prospect Finder, Kontak, Riwayat Sesi, Laporan Lapangan, Area Insights, Iklan & Kampanye |
| Operasional & Technical Support | `teknik` | Peta Jaringan, Work Order, POP/ODC/ODP/Tiang/Kabel, Core Management (OTB/Bestray/Splitter/Core/Koneksi), Tools Jaringan (Splitter Chain/Power Budget/Export-Import) |
| NOC | `noc` | **Dashboard Jaringan** (eks dashboard global, kini `/dashboard-jaringan`), Monitoring, Sesi Aktif, Perangkat ONT, Router MikroTik |
| Layanan Pelanggan | `cs` | Pelanggan, Komunikasi, JABNET Sahabat, Whatsapp (Nomor/Template/Phonebook/Broadcast) |
| Keuangan | `keuangan` | Collection (Penagihan), Paket Internet |
| HRD | `hrd` | Manajemen User, Activity & Produktivitas |
| Teamspace | `teamspace` | Semua Tugas, Tim Saya, Laporan Kinerja, Cheers |

**Visibilitas**: group divisi muncul di sidebar hanya bila user punya izin
minimal satu modulnya (item hub `Beranda <Divisi>` tidak dihitung).

## Role → Divisi Utama (redirect Beranda)

`marketing/marketing_spv → marketing` · `operator/teknisi → teknik` ·
`noc → noc` · `cs → cs` · `finance → keuangan` · `hrd → hrd` ·
lainnya (admin dsb.) → grid pemilih divisi.
Role baru cukup ditambahkan di `ROLE_HOME_DIVISION`.

## Roadmap Laporan Dashboard per Divisi (bertahap)

Hub v1 (sudah): KPI dari `/api/dashboard` + tugas Teamspace. Berikutnya per divisi:

- **Marketing** - sudah matang (`/marketing`); hub menautkan ke sana.
- **Teknik** - laporan WO per teknisi + SLA, aset baru per periode, ODP kritis trend.
- **NOC** - uptime router/ONT, isolir trend harian (kpi_snapshots), alert center.
- **Layanan Pelanggan** - tiket per kanal, respon WhatsApp, NPS/keluhan.
- **Keuangan** - aging collection, recovery rate, pendapatan per paket.
- **HRD** - produktivitas per user (endpoint `/api/users/:id/stats`), skor Teamspace.

Pola implementasi: tambah selector KPI di `DivisionHubPage` (atau ganti hub jadi
halaman laporan penuh gaya Cicle seperti `TeamReportPanel`) - struktur navigasi
tidak perlu berubah lagi.

## Modul HR & Payroll (PRD-HR / PRDHR.md - pengganti GajiHub)

Status implementasi (di stack workspace: Express + Drizzle MySQL, bukan Next/Prisma):

**HR-1 SELESAI** - registry karyawan + wizard profil 3 langkah + import massal;
struktur organisasi/jabatan/pangkat; presensi ESS `/hr/absen` (GPS+selfie+IP,
radius multi-kantor, di luar radius → Approval Presensi); shift tetap + roster
rotasi per tanggal (telat otomatis); cuti 5 jenis + saldo + alur berjenjang
Manajer→HR; lembur; kalender libur; import mesin fingerprint (Fingerspot).

**HR-2 SELESAI** - payroll: komponen gaji per karyawan, generate massal per
periode (otomatis: alpha, lembur approved, cuti unpaid, cicilan kasbon,
reimburse), PPh 21 TER PMK 168/2023 + BPJS TK/Kes (mesin murni ber-unit-test
`shared/payroll.ts` - VERIFIKASI tarif sebelum bayar sungguhan), slip ESS
(paid-only), tandai bayar (memicu potong sisa kasbon + reimburse paid),
ekspor jurnal CSV. Kasbon berplafon (default 1× gaji pokok) + reimburse.

**HR-3 SELESAI + Dashboard HR (FR-HR-15xx)** - pelacakan lokasi teknisi (ping 5-menit ESS
selama jam kerja, transparan, retensi 30 hari, panel "Posisi Teknisi Hari
Ini"); master klien + kunjungan dengan validasi RADIUS (check-in luar radius
ditandai); KPI form builder berbobot + penilaian 1-5 + rekap 0-100; petty
cash per pemegang; pipeline "Rekrutmen Kandidat" ter-seed; slip gaji versi
cetak (print→PDF) + rekap PPh 21 CSV; Dashboard HR (headcount,
kehadiran hari ini, antrean approval terpusat, demografi karyawan). Di luar scope (sesuai §13/§15 PRD):
bukti potong format resmi Coretax (butuh template DJP final), SSO/VA,
ID card generator, integrasi akuntansi non-CSV, aplikasi native.
