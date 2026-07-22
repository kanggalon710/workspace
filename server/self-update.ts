/** Self-update (v5.7): cek + terapkan pembaruan aplikasi dari GitHub tanpa SSH ke cPanel.
 *
 *  Model deploy (lihat .github/workflows/build.yml):
 *    push main/dev -> GHA build -> FORCE-PUSH payload pre-built ke orphan branch `deploy`/`deploy-dev`.
 *    cPanel prod checkout branch `deploy` (berisi dist/ siap pakai + metadata .build-*).
 *
 *  Jadi "update" di server = git fetch + reset --hard ke origin/<deploy-branch> + (npm install bila
 *  lockfile berubah) + touch tmp/restart.txt (Passenger reload). TIDAK perlu rebuild di server.
 *
 *  Deteksi versi = bandingkan SOURCE sha (isi file .build-sha) lokal vs remote (di branch deploy).
 *  Aman untuk private repo: GitHub API pakai token (disimpan di app_settings, opsional). */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const execFileAsync = promisify(execFile);
const APP_ROOT = process.cwd();

export type SelfUpdateConfig = {
  enabled: boolean;
  repo: string;      // "owner/repo"
  branch: string;    // branch yang di-track cPanel. Kosong = auto-detect branch aktif.
  token: string | null;
  runNpm: boolean;   // jalankan npm install saat perlu
  build: "auto" | "always" | "never"; // "auto" = build kalau checkout SOURCE (ada vite.config)
};

/** Branch git yang sedang ter-checkout (untuk auto-detect kalau config kosong). */
async function currentBranch(): Promise<string | null> {
  try {
    const b = (await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: APP_ROOT, timeout: 10_000 })).stdout.trim();
    return b && b !== "HEAD" ? b : null;
  } catch { return null; }
}

/** Branch efektif: config kalau diisi, kalau tidak auto-detect branch aktif, fallback "deploy". */
async function resolveBranch(cfg: SelfUpdateConfig): Promise<string> {
  if (cfg.branch && cfg.branch.trim()) return cfg.branch.trim();
  return (await currentBranch()) || "deploy";
}

/** Checkout SOURCE (bukan payload pre-built) kalau ada vite.config - artinya perlu `npm run build`. */
function isSourceCheckout(): boolean {
  return existsSync(path.join(APP_ROOT, "vite.config.ts")) || existsSync(path.join(APP_ROOT, "vite.config.js"));
}

export type BuildInfo = {
  version: string | null;        // package.json version
  sourceSha: string | null;      // isi .build-sha (commit sumber yang di-build)
  sourceShaShort: string | null;
  buildTime: string | null;      // isi .build-time (ISO)
  buildEnv: string | null;       // isi .build-env (production/development)
  buildSourceBranch: string | null; // isi .build-source-branch (main/dev)
  gitHead: string | null;        // git rev-parse HEAD (commit deploy-branch yang ter-checkout)
};

async function readTrim(file: string): Promise<string | null> {
  try { return (await readFile(path.join(APP_ROOT, file), "utf8")).trim() || null; }
  catch { return null; }
}

/** Info build lokal (dibaca dari file metadata payload + package.json + git). */
export async function getBuildInfo(): Promise<BuildInfo> {
  const [sourceSha, buildTime, buildEnv, buildSourceBranch] = await Promise.all([
    readTrim(".build-sha"), readTrim(".build-time"), readTrim(".build-env"), readTrim(".build-source-branch"),
  ]);
  let version: string | null = null;
  try { version = JSON.parse(await readFile(path.join(APP_ROOT, "package.json"), "utf8")).version ?? null; } catch { /* - */ }
  let gitHead: string | null = null;
  try { gitHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: APP_ROOT, timeout: 10_000 })).stdout.trim() || null; } catch { /* not a git checkout */ }
  return {
    version, sourceSha, sourceShaShort: sourceSha ? sourceSha.slice(0, 7) : null,
    buildTime, buildEnv, buildSourceBranch, gitHead,
  };
}

async function ghApi(repo: string, endpoint: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "jabnet-workspace-selfupdate",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, { headers });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GitHub API ${resp.status}: ${body.slice(0, 200) || resp.statusText}`);
  }
  return resp.json();
}

/** Ambil isi file text dari branch deploy via Contents API (base64 -> utf8). Null kalau tak ada. */
async function ghFileContent(repo: string, filePath: string, branch: string, token: string | null): Promise<string | null> {
  try {
    const data = await ghApi(repo, `/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
    if (data?.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf8").trim() || null;
    }
    return null;
  } catch { return null; }
}

export type UpdateCheck = {
  current: BuildInfo;
  remote: {
    sourceSha: string | null; sourceShaShort: string | null;
    buildTime: string | null; commitSha: string | null; commitDate: string | null; commitMessage: string | null;
  };
  branch: string;          // branch efektif yang dicek/di-pull (hasil resolve)
  sourceCheckout: boolean; // true = checkout source (update akan build), false = payload pre-built
  updateAvailable: boolean;
  reason: string;
};

/** Bandingkan build lokal dengan branch deploy di GitHub. */
export async function checkForUpdate(cfg: SelfUpdateConfig): Promise<UpdateCheck> {
  const current = await getBuildInfo();
  const base = { sourceSha: null, sourceShaShort: null, buildTime: null, commitSha: null, commitDate: null, commitMessage: null };
  const branch = await resolveBranch(cfg);
  const sourceCheckout = isSourceCheckout();

  if (!cfg.repo) return { current, remote: base, branch, sourceCheckout, updateAvailable: false, reason: "repo_not_set" };

  // Commit terakhir di branch (untuk pesan + tanggal) + source sha dari .build-sha remote (bila ada).
  const [commit, remoteSourceSha, remoteBuildTime] = await Promise.all([
    ghApi(cfg.repo, `/commits/${encodeURIComponent(branch)}`, cfg.token).catch(() => null),
    ghFileContent(cfg.repo, ".build-sha", branch, cfg.token),
    ghFileContent(cfg.repo, ".build-time", branch, cfg.token),
  ]);

  const remote = {
    sourceSha: remoteSourceSha,
    sourceShaShort: remoteSourceSha ? remoteSourceSha.slice(0, 7) : null,
    buildTime: remoteBuildTime,
    commitSha: commit?.sha ?? null,
    commitDate: commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null,
    commitMessage: commit?.commit?.message ?? null,
  };

  // Utama: bandingkan SOURCE sha (paling akurat). Fallback: git head lokal vs commit sha branch deploy.
  let updateAvailable = false;
  let reason = "up_to_date";
  if (current.sourceSha && remote.sourceSha) {
    updateAvailable = current.sourceSha !== remote.sourceSha;
    reason = updateAvailable ? "source_sha_differs" : "up_to_date";
  } else if (current.gitHead && remote.commitSha) {
    updateAvailable = current.gitHead !== remote.commitSha;
    reason = updateAvailable ? "git_head_differs" : "up_to_date";
  } else if (!remote.sourceSha && !remote.commitSha) {
    reason = "remote_unreachable";
  } else {
    reason = "no_local_build_meta";
  }
  return { current, remote, branch, sourceCheckout, updateAvailable, reason };
}

async function fileHash(file: string): Promise<string | null> {
  try {
    const buf = await readFile(path.join(APP_ROOT, file));
    return createHash("sha256").update(buf).digest("hex");
  } catch { return null; }
}

export type UpdateStep = { step: string; ok: boolean; output: string };
export type UpdateResult = { ok: boolean; steps: UpdateStep[]; restartTriggered: boolean; newBuild: BuildInfo };

async function runGit(args: string[]): Promise<UpdateStep> {
  const label = `git ${args.join(" ")}`;
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd: APP_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return { step: label, ok: true, output: (stdout + stderr).trim().slice(0, 4000) };
  } catch (e: any) {
    return { step: label, ok: false, output: String(e?.stderr || e?.message || e).slice(0, 4000) };
  }
}

async function runCmd(step: string, cmd: string, args: string[], timeoutMs: number): Promise<UpdateStep> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: APP_ROOT, timeout: timeoutMs, maxBuffer: 24 * 1024 * 1024 });
    return { step, ok: true, output: (stdout + stderr).trim().slice(-3500) };
  } catch (e: any) {
    return { step, ok: false, output: String(e?.stderr || e?.stdout || e?.message || e).slice(-3500) };
  }
}

/** Terapkan pembaruan: fetch + reset --hard ke origin/<branch>. Kalau checkout SOURCE
 *  (ada vite.config), jalankan npm install + npm run build agar dist/ ikut ter-update.
 *  Terakhir touch tmp/restart.txt (Passenger reload pada request berikutnya). */
export async function runSelfUpdate(cfg: SelfUpdateConfig): Promise<UpdateResult> {
  const steps: UpdateStep[] = [];
  const branch = await resolveBranch(cfg);
  const source = isSourceCheckout();
  const lockBefore = await fileHash("package-lock.json");
  steps.push({ step: "info", ok: true, output: `branch=${branch} · mode=${source ? "SOURCE (perlu build)" : "PRE-BUILT (payload dist)"}` });

  // 1. Fetch branch dari origin. Deploy branch di-force-push, source branch bisa maju biasa - reset aman untuk keduanya.
  steps.push(await runGit(["fetch", "origin", branch, "--depth=1"]));
  if (!steps[steps.length - 1].ok) return { ok: false, steps, restartTriggered: false, newBuild: await getBuildInfo() };

  // 2. Reset hard ke remote (menimpa working tree dengan versi terbaru).
  steps.push(await runGit(["reset", "--hard", `origin/${branch}`]));
  if (!steps[steps.length - 1].ok) return { ok: false, steps, restartTriggered: false, newBuild: await getBuildInfo() };

  // 3. Tentukan apakah perlu build (source checkout) - butuh devDeps, jadi install penuh.
  const doBuild = cfg.build === "always" || (cfg.build !== "never" && source);
  const lockAfter = await fileHash("package-lock.json");
  const lockChanged = lockBefore !== lockAfter;
  const needInstall = cfg.runNpm && (doBuild || (lockChanged && !!lockAfter) || !existsSync(path.join(APP_ROOT, "node_modules")));

  if (needInstall) {
    // Build butuh devDependencies (vite/esbuild) -> install penuh. Pre-built cukup --omit=dev.
    const args = doBuild ? ["install", "--no-audit", "--no-fund"] : ["install", "--omit=dev", "--no-audit", "--no-fund"];
    steps.push(await runCmd(`npm ${args.join(" ")}`, "npm", args, 420_000));
    if (!steps[steps.length - 1].ok) return { ok: false, steps, restartTriggered: false, newBuild: await getBuildInfo() };
  } else {
    steps.push({ step: "npm install", ok: true, output: "dilewati - tidak perlu (dependency & node_modules sudah sesuai)" });
  }

  // 4. Build dari source bila perlu (menghasilkan dist/ terbaru).
  if (doBuild) {
    steps.push(await runCmd("npm run build", "npm", ["run", "build"], 600_000));
    if (!steps[steps.length - 1].ok) return { ok: false, steps, restartTriggered: false, newBuild: await getBuildInfo() };
  } else {
    steps.push({ step: "npm run build", ok: true, output: "dilewati - payload sudah pre-built (dist/ dari CI)" });
  }

  // 5. Touch tmp/restart.txt -> Passenger reload proses pada HTTP request berikutnya.
  let restartTriggered = false;
  try {
    const tmpDir = path.join(APP_ROOT, "tmp");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(path.join(tmpDir, "restart.txt"), new Date().toISOString());
    restartTriggered = true;
    steps.push({ step: "restart aplikasi (Passenger)", ok: true, output: "tmp/restart.txt di-touch - proses reload pada request berikutnya" });
  } catch (e: any) {
    steps.push({ step: "restart aplikasi (Passenger)", ok: false, output: String(e?.message || e) });
  }

  return { ok: steps.every((s) => s.ok), steps, restartTriggered, newBuild: await getBuildInfo() };
}

/** Cek keberadaan tmp/ untuk mengetahui apakah restart-file mekanisme tersedia (Passenger). */
export async function passengerRestartSupported(): Promise<boolean> {
  try { await stat(path.join(APP_ROOT, "tmp")); return true; } catch { return false; }
}
