/** One-off verifikasi: jalankan Phase 4 billing-intake (runBillingIntakeRules) sekali untuk
 *  mitra 1, membaca tabel customers lokal. Membuktikan rule billing_sync membuat/menutup kartu.
 *  Run: bundle --packages=external, scp ke app dir, node + .env. */
import "../server/config.js";
import { withMitra } from "../server/tenant-context.js";
import { runBillingIntakeRules } from "../server/pipeline-billing-intake.js";

const res = await withMitra(1, () => runBillingIntakeRules());
console.log("[intake]", JSON.stringify(res));
process.exit(0);
