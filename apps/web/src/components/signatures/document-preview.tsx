"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { inboxText as t } from "@/lib/i18n/inbox";

interface PreviewProps {
  file: Blob;
  onDisplayed: (ok: boolean) => void;
}

export function DocumentPreview({ file, onDisplayed }: PreviewProps) {
  const image = useRef<HTMLImageElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!image.current || file.type === "application/pdf") return;
    const url = URL.createObjectURL(file);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (file.type === "application/pdf") return <PdfPreview file={file} onDisplayed={onDisplayed} />;
  return (
    <>
      {/* A local decrypted blob URL cannot use Next's server-side image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={image}
        alt={t.preview}
        className="mx-auto max-h-[65vh] max-w-full object-contain"
        onLoad={() => onDisplayed(true)}
        onError={() => {
          onDisplayed(false);
          setError(true);
        }}
      />
      {error && <p role="alert">{t.renderError}</p>}
    </>
  );
}

function PdfPreview({ file, onDisplayed }: PreviewProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      const [library, data] = await Promise.all([import("pdfjs-dist"), file.arrayBuffer()]);
      if (cancelled) return;
      const assets = location.origin + "/pdf-assets/";
      library.GlobalWorkerOptions.workerSrc = assets + "build/pdf.worker.min.mjs";
      task = library.getDocument({
        data,
        stopAtErrors: true,
        useWorkerFetch: true,
        cMapUrl: assets + "cmaps/",
        standardFontDataUrl: assets + "standard_fonts/",
        wasmUrl: assets + "wasm/",
        iccUrl: assets + "iccs/",
      });
      const doc = await task.promise;
      if (!cancelled) setPdf(doc);
    }
    void load().catch(() => {
      if (!cancelled) {
        setFailed(true);
        onDisplayed(false);
      }
    });
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [file, onDisplayed]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    async function draw(doc: PDFDocumentProxy) {
      const item = await doc.getPage(page);
      if (cancelled || !canvas.current) return;
      const base = item.getViewport({ scale: 1 });
      const viewport = item.getViewport({
        scale: Math.min(2, 1280 / base.width, 1800 / base.height),
      });
      const el = canvas.current;
      el.width = Math.ceil(viewport.width);
      el.height = Math.ceil(viewport.height);
      render = item.render({ canvas: el, viewport });
      await render.promise;
      if (!cancelled) onDisplayed(true);
    }
    void draw(pdf).catch(() => {
      if (!cancelled) {
        setFailed(true);
        onDisplayed(false);
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, onDisplayed]);
  function turn(next: number) {
    onDisplayed(false);
    setFailed(false);
    setPage(next);
  }
  return (
    <div className="space-y-3">
      {failed && (
        <p className="text-destructive" role="alert">
          {t.renderError}
        </p>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={pdf ? t.page(page, pdf.numPages) : t.preview}
        className="mx-auto block h-auto max-w-full"
      />
      {pdf && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => turn(page - 1)}>
            {t.previousPage}
          </Button>
          <span className="text-sm" aria-live="polite">
            {t.page(page, pdf.numPages)}
          </span>
          <Button variant="outline" disabled={page >= pdf.numPages} onClick={() => turn(page + 1)}>
            {t.nextPage}
          </Button>
        </div>
      )}
    </div>
  );
}
