# Respon Audit Teamspace - Status Perbaikan

> Menjawab `AUDIT_PERBAIKAN_TEAMSPACE.md` (18 Juli 2026). Tiap temuan diverifikasi
> langsung ke kode, bukan diasumsikan. Verifikasi build: typecheck 0 error · unit test
> pass · build produksi sukses.

## Prioritas Tinggi

| ID | Temuan | Status | Perbaikan |
|---|---|---|---|
| BUG-001 | Donut "Distribusi Status Tugas" render blob | Fixed | `ResponsiveContainer width="99%"` + `key` remount + `isAnimationActive=false` + `paddingAngle=0` saat 1 kategori - atasi container terukur 0-width pada mount di grid/flex |
| BUG-002 | Deskripsi kartu kehilangan rich text | Fixed | Komponen `MarkdownField` baru (bold/italic/list/heading/link + toggle Preview) tanpa dep berat; renderer `miniMarkdown` diekstrak ke `client/lib` & dipakai ulang di Dokumen. Tiptap tetap opsi upgrade bila perlu WYSIWYG penuh |
| BUG-003 | Hard-delete berdampingan dengan Arsipkan | Fixed | "Hapus Kartu" **disembunyikan di board tim** (`pipeline.teamId != null`) - pakai Arsipkan (reversible). Pipeline ops (lead/collection) tetap punya delete. Konfirmasi 2-langkah dipertahankan |
| BUG-004 | Pengumuman per-tim tidak ada (0%) | Built | **Modul baru**: tab **Pengumuman** di halaman tim + endpoint `/api/teamspace/teams/:id/announcements` (bertarget + Rahasia + selesai-otomatis + notifikasi ke penerima/anggota). Terpisah dari `/announcements` changelog company-wide. Permission key `team_announcements` |
| BUG-005 | Assignee terpecah 3 mekanisme | Fixed | Radio "JABNET/Lintas mitra" **disembunyikan di board tim**; label "Assignee" → "Penanggung jawab utama". Picker "Penanggung jawab tambahan" tetap untuk multi-assignee |
| BUG-006 | "Kinerja per Anggota" kosong padahal ada tugas | Fixed | Kartu tanpa penanggung jawab kini **dikreditkan ke pembuatnya** → angka per-anggota rekonsiliasi dengan total (tiap kartu non-batal pasti punya creator), empty-state palsu hilang |

## Prioritas Menengah

| ID | Temuan | Status | Catatan |
|---|---|---|---|
| BUG-007 | Cover image kartu | Fixed | Upload/ganti/hapus cover di modal kartu (kolom `cover_path`, endpoint upload/stream/delete, hanya gambar) |
| BUG-008 | Modal kartu single-column panjang | Fixed | Layout 2 kolom di md+: kiri konten (deskripsi/checklist/komentar/aktivitas), kanan panel aksi **sticky** (stage, prioritas, assignee, cover, tenggat, ulangi, label, aksi) - pola Cicle. Mobile tetap 1 kolom (aksi di atas). Modal default diperlebar |
| BUG-009 | Badge LIST vs TENGGAT sama-sama "Selesai" | Fixed | Kolom TENGGAT kini "Tepat waktu"/"Selesai telat" (bukan "Selesai" ganda); tanpa due date → tak ada badge |
| BUG-010 | Kalender Semua Tugas 1 bulan vs Jadwal 2 bulan | Fixed | Kalender Semua Tugas kini **2 bulan berdampingan** (xl+; menumpuk di layar sempit) + nav prev/next - konsisten dgn Jadwal tim |
| BUG-011 | Voice note di chat | Fixed | Tombol mic di composer chat: rekam via MediaRecorder (webm/m4a), timer + Batal/Kirim, dikirim sebagai lampiran audio, bubble render player `<audio>`. Tipe audio ditambahkan ke attachmentRules |

## Keputusan Scope (§3)

- **§3.1 Pengumuman per-tim** → dibangun sebagai **modul baru** (opsi a), bukan sekadar filter di `/announcements`.
- **§3.2 Nested team (HQ→Tim→Proyek)** → **DIKERJAKAN (versi dasar)**: picker "Tim induk" di form Buat Tim, `parentId` di create/update (validasi anti-siklus), daftar Tim Saya diurutkan hierarkis dgn penanda "↳ Sub-tim dari X". Tanpa node HQ (root = daftar tim, sesuai PRD adaptasi).
- **§3.3 Billing FR-15xx** → **resmi out-of-scope**. Sudah ditandai `[DROP SELURUHNYA]` di `PRD-JABNET-TEAMSPACE.md` §7 (Teamspace = modul internal, bukan SaaS per-perusahaan).
- **§3.4 Filter tim chip vs dropdown** → chip dipertahankan untuk jumlah tim saat ini; migrasi ke dropdown dijadwalkan bila tim > 8-10 (backlog).

## Sisa backlog (menunggu prioritas)

**Semua 11 temuan audit (BUG-001..011) sudah ditangani.** Tersisa polish opsional:
migrasi filter tim chip → dropdown bila tim > 8-10 (§3.4), pencarian ⌘K konten Teamspace,
editor Tiptap WYSIWYG penuh (markdown ringan sudah ada), pindah-induk tim dari UI
pengaturan tim (server sudah mendukung PATCH parentId).
