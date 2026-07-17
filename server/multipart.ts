import busboy from "busboy";
import type { Request } from "express";

export interface ParsedFile { fieldName: string; fileName: string; mimeType: string; buffer: Buffer }
export interface ParsedMultipart { files: ParsedFile[]; fields: Record<string, string> }

/** Parse a multipart/form-data request into in-memory files + fields.
 *  Aborts with an error if any single file exceeds maxBytes (no temp files).
 *  maxFiles caps the number of file parts accepted (default 20).
 *  maxTotalBytes caps the cumulative bytes across all files. */
export function parseMultipart(req: Request, opts: { maxBytes: number; maxFiles?: number; maxTotalBytes?: number }): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const maxFiles = opts.maxFiles ?? 20;
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: opts.maxBytes, files: maxFiles } });
    } catch (e) { return reject(e); }

    const files: ParsedFile[] = [];
    const fields: Record<string, string> = {};
    let aborted = false;
    let total = 0;
    const fail = (err: Error) => { if (!aborted) { aborted = true; reject(err); } };

    bb.on("field", (name: string, val: string) => { fields[name] = val; });
    bb.on("file", (fieldName: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => {
        total += c.length;
        if (opts.maxTotalBytes && total > opts.maxTotalBytes) {
          fail(new Error("Total ukuran upload melebihi batas"));
          stream.resume();
          return;
        }
        chunks.push(c);
      });
      stream.on("limit", () => fail(new Error("File melebihi batas ukuran")));
      stream.on("close", () => {
        if (aborted) return;
        files.push({ fieldName, fileName: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) });
      });
    });
    bb.on("filesLimit", () => fail(new Error(`Maksimal ${maxFiles} file per upload`)));
    bb.on("error", fail);
    bb.on("close", () => { if (!aborted) resolve({ files, fields }); });
    req.pipe(bb);
  });
}
