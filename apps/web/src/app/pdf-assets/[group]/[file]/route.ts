import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve PDF.js's own worker, CJK character maps and font/decoder resources from this origin.
const files: Record<string, RegExp> = {
  build: /^pdf\.worker\.min\.mjs$/,
  cmaps: /^[\w-]+\.bcmap$/,
  standard_fonts: /^[\w-]+\.(ttf|pfb)$/,
  iccs: /^[\w.-]+\.icc$/,
  wasm: /^[\w-]+\.(wasm|js)$/,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ group: string; file: string }> },
) {
  const { group, file } = await params;
  const notice = /^LICENSE(?:_[A-Z0-9_]+)?$/.test(file);
  if (!Object.hasOwn(files, group) || (!notice && !files[group]?.test(file)))
    return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(
      path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        group === "build" && notice ? "" : group,
        file,
      ),
    );
    const mime = notice
      ? "text/plain; charset=utf-8"
      : /\.m?js$/.test(file)
        ? "text/javascript"
        : file.endsWith(".wasm")
          ? "application/wasm"
          : "application/octet-stream";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
