"use client";

import { useEffect, useRef, useState } from "react";

/** Target pixel width for the rendered thumbnail canvas */
const THUMB_PX_WIDTH = 240;

type State = "loading" | "done" | "error";

type Props = {
  /** Same-origin URL serving the PDF binary (e.g. /api/case-files/open?...) */
  src: string;
  /** Fallback node shown when PDF rendering fails */
  fallback: React.ReactNode;
  className?: string;
  loadingClassName?: string;
};

/**
 * Renders the first page of a PDF as a real canvas thumbnail.
 * Uses pdfjs-dist (client-side only). Fetches `src` via the same-origin
 * /api/case-files/open proxy so cookies/auth are handled automatically.
 */
export function PdfThumbnail({ src, fallback, className, loadingClassName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let isCancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfDocument: any = null;

    async function render() {
      try {
        // Dynamic import keeps pdfjs out of the initial JS bundle
        const pdfjs = await import("pdfjs-dist");

        // Set the worker source once — uses the static file copied to /public by postinstall
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        if (isCancelled) return;

        pdfDocument = await pdfjs.getDocument({
          url: src,
          // Suppress external font/cmap fetches — not needed for thumbnail
          disableFontFace: true,
          cMapUrl: undefined,
          standardFontDataUrl: undefined,
        }).promise;

        if (isCancelled) return;

        const page = await pdfDocument.getPage(1);
        if (isCancelled) return;

        const naturalViewport = page.getViewport({ scale: 1 });
        const scale = THUMB_PX_WIDTH / naturalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // CSS width: 100%, height auto → keeps aspect ratio inside the card
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (isCancelled) return;

        setState("done");
      } catch {
        if (!isCancelled) setState("error");
      } finally {
        if (pdfDocument && !isCancelled) {
          // Free memory after rendering
          pdfDocument.destroy();
        }
      }
    }

    render();

    return () => {
      isCancelled = true;
      pdfDocument?.destroy();
    };
  }, [src]);

  if (state === "error") {
    return <>{fallback}</>;
  }

  return (
    <>
      {state === "loading" && (
        <span
          className={loadingClassName}
          aria-hidden="true"
        />
      )}
      {/* Canvas is rendered but hidden until done */}
      <canvas
        ref={canvasRef}
        className={className}
        style={{ display: state === "done" ? "block" : "none" }}
        aria-hidden="true"
      />
    </>
  );
}
