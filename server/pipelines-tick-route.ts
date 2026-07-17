import { Router, type Request, type Response } from "express";
import { runTimeTriggers } from "./pipeline-automation.js";

export const pipelinesTickRouter = Router();

/** Cron-driven evaluation of time-based pipeline automation rules.
 *  Guarded by a shared secret (header X-Automation-Secret == PIPELINE_TICK_SECRET).
 *  Intentionally NOT behind staff auth and NOT gated by WORKERS_ENABLED. */
pipelinesTickRouter.post("/api/pipelines/automation/tick", async (req: Request, res: Response) => {
  const secret = process.env.PIPELINE_TICK_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: "tick disabled (PIPELINE_TICK_SECRET unset)" });
  const got = String(req.header("x-automation-secret") ?? "");
  if (got.length !== secret.length || !timingSafeEqualStr(got, secret)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  try {
    const result = await runTimeTriggers();
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message ?? "tick failed" });
  }
});

function timingSafeEqualStr(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
