/** Pure, safe formula parser + evaluator for pipeline metrics — NO eval(). Shunting-yard → RPN. */

export const FORMULA_TERM_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" };

/** Tokenize. Throws on an unrecognized character. */
function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") { toks.push({ t: "op", v: ch }); i++; continue; }
    if (ch === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (ch === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let j = i + 1;
      while (j < expr.length && ((expr[j] >= "0" && expr[j] <= "9") || expr[j] === ".")) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Angka tidak valid: ${expr.slice(i, j)}`);
      toks.push({ t: "num", v: num }); i = j; continue;
    }
    if (ch >= "a" && ch <= "z") { toks.push({ t: "id", v: ch }); i++; continue; }
    throw new Error(`Karakter tidak valid: ${ch}`);
  }
  return toks;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Convert token stream to RPN. Throws on malformed expressions (unbalanced parens, bad operator placement). */
function toRpn(toks: Tok[], allowedKeys: string[]): Tok[] {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null; // for detecting unary/leading/double operators
  for (const tok of toks) {
    if (tok.t === "num") {
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Operand tanpa operator");
      out.push(tok);
    } else if (tok.t === "id") {
      if (!allowedKeys.includes(tok.v)) throw new Error(`Term tidak dikenal: ${tok.v}`);
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Operand tanpa operator");
      out.push(tok);
    } else if (tok.t === "op") {
      // No leading operator and no two operators in a row.
      if (prev === null || prev.t === "op" || prev.t === "lp") throw new Error("Operator di posisi salah");
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && PREC[top.v] >= PREC[tok.v]) out.push(ops.pop()!);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === "lp") {
      if (prev && (prev.t === "num" || prev.t === "id" || prev.t === "rp")) throw new Error("Kurung buka di posisi salah");
      ops.push(tok);
    } else if (tok.t === "rp") {
      if (prev === null || prev.t === "op" || prev.t === "lp") throw new Error("Kurung tutup di posisi salah");
      let found = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.t === "lp") { found = true; break; }
        out.push(top);
      }
      if (!found) throw new Error("Kurung tidak seimbang");
    }
    prev = tok;
  }
  if (prev === null) throw new Error("Ekspresi kosong");
  if (prev.t === "op" || prev.t === "lp") throw new Error("Ekspresi berakhir dengan operator");
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === "lp" || top.t === "rp") throw new Error("Kurung tidak seimbang");
    out.push(top);
  }
  return out;
}

/** Evaluate RPN. Divide-by-zero short-circuits the WHOLE result to 0 via a sentinel throw caught here. */
function evalRpn(rpn: Tok[], values: Record<string, number>): number {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") st.push(tok.v);
    else if (tok.t === "id") st.push(Number(values[tok.v] ?? 0));
    else if (tok.t === "op") {
      const b = st.pop(); const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("Ekspresi tidak valid");
      let r: number;
      switch (tok.v) {
        case "+": r = a + b; break;
        case "-": r = a - b; break;
        case "*": r = a * b; break;
        case "/": if (b === 0) return 0; r = a / b; break;
        default: throw new Error("Operator tidak dikenal");
      }
      st.push(r);
    }
  }
  if (st.length !== 1) throw new Error("Ekspresi tidak valid");
  return st[0];
}

/** Validate without evaluating. Returns {ok:true} or {ok:false,error}. Empty → invalid. */
export function parseFormula(expr: string, allowedKeys: string[]): { ok: true } | { ok: false; error: string } {
  if (!expr || !expr.trim()) return { ok: false, error: "Ekspresi kosong" };
  try { toRpn(tokenize(expr), allowedKeys); return { ok: true }; }
  catch (e: any) { return { ok: false, error: e?.message || "Ekspresi tidak valid" }; }
}

/** Evaluate. Throws on a parse error (the engine catches and renders a zero tile). Divide-by-zero → 0. */
export function evaluateFormula(expr: string, values: Record<string, number>): number {
  const rpn = toRpn(tokenize(expr), Object.keys(values));
  const out = evalRpn(rpn, values);
  return Number.isFinite(out) ? out : 0;
}
