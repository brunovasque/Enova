"use client";

import { useEffect, useRef, useState } from "react";

/** Target pixel width for the rendered thumbnail canvas (for PDF path) */
const THUMB_PX_WIDTH = 240;

type Phase =
  | { state: "loading" }
  | { state: "image"; blobUrl: string }
  | { state: "pdf" }
  | { state: "fallback" };

type Props = {
  /**
   * Same-origin proxy URL for the file — e.g. /api/case-files/open?...
   * The component fetches this URL once, reads the real Content-Type from the
   * HTTP response headers, and dispatches to the appropriate renderer.
   */
  src: string;
  /** Shown when type detection or rendering fails */
  fallback: React.ReactNode;
  canvasClassName?: string;
  imgClassName?: string;
  loadingClassName?: string;
};

/**
 * Auto-detects file type at render time by fetching the file once as a Blob
 * and reading the real Content-Type from the HTTP response headers.
 *
 * This solves the case where `mime_type` is null (e.g. Graph API URLs with no
 * file extension — graph.facebook.com/v20.0/{media_id}).
 *
 * Render cascade:
 *   image/* → <img src={blobUrl}>
 *   application/pdf (or unrecognized) → pdfjs canvas render of page 1
 *   error / 4xx / pdfjs failure → `fallback`
 */
export function SmartFilePreview({
  src,
  fallback,
  canvasClassName,
  imgClassName,
  loadingClassName,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>({ state: "loading" });

  useEffect(() => {
    let isCancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfDocument: any = null;
    // Track the blob URL so it can be revoked on cleanup
    let activeBlobUrl: string | null = null;

    async function probe() {
      try {
        const response = await fetch(src);
        if (isCancelled) return;
        if (!response.ok) {
          setPhase({ state: "fallback" });
          return;
        }

        const blob = await response.blob();
        if (isCancelled) return;

        // Prefer the HTTP Content-Type header; fall back to the Blob's own type
        const contentType = (
          response.headers.get("content-type") ??
          blob.type ??
          ""
        )
          .toLowerCase()
          .split(";")[0]
          .trim();

        activeBlobUrl = URL.createObjectURL(blob);

        if (contentType.startsWith("image/")) {
          // ── Image path ──────────────────────────────────────────────
          setPhase({ state: "image", blobUrl: activeBlobUrl });
          return;
        }

        // ── PDF / unknown path — attempt pdfjs render ────────────────
        try {
          const pdfjs = await import("pdfjs-dist");
          if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          }
          if (isCancelled) return;

          pdfDocument = await pdfjs.getDocument({
            url: activeBlobUrl,
            disableFontFace: true,
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
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Failed to get 2D canvas context");

          await page.render({ canvasContext: ctx, viewport }).promise;
          if (isCancelled) return;

          setPhase({ state: "pdf" });
        } catch {
          if (!isCancelled) setPhase({ state: "fallback" });
        } finally {
          pdfDocument?.destroy();
          pdfDocument = null;
        }
      } catch {
        if (!isCancelled) setPhase({ state: "fallback" });
      }
    }

    probe();

    return () => {
      isCancelled = true;
      pdfDocument?.destroy();
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [src]);

  if (phase.state === "fallback") {
    return <>{fallback}</>;
  }

  return (
    <>
      {/* Shimmer placeholder while probing / rendering */}
      {phase.state === "loading" && (
        <span className={loadingClassName} aria-hidden="true" />
      )}

      {/* Image path */}
      {phase.state === "image" && (
        <img
          src={phase.blobUrl}
          className={imgClassName}
          alt=""
          aria-hidden="true"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      )}

      {/* PDF canvas (hidden until rendered) */}
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        style={{ display: phase.state === "pdf" ? "block" : "none" }}
        aria-hidden="true"
      />
    </>
  );
}
