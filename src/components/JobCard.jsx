import { useEffect, useMemo, useState } from "react";
import Timeline from "./Timeline";
import LottiePreview from "./LottiePreview";
import { buildLottie, buildDotLottie } from "../lib/lottieBuilder";
import "./JobCard.css";

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function JobCard({ job, options, onFramesChange, onRemove }) {
  const { name, frames } = job;
  const [previewData, setPreviewData] = useState(null);
  const [exporting, setExporting] = useState(null); // 'lottie' | 'json' | null

  const typeBreakdown = useMemo(() => {
    const svgCount = frames.filter((f) => f.type === "svg" && !f.rasterized).length;
    const pngCount = frames.filter((f) => f.type === "png" && !f.rasterized).length;
    const rasterizedCount = frames.filter((f) => f.rasterized).length;
    const parts = [];
    if (svgCount) parts.push(`${svgCount} svg`);
    if (pngCount) parts.push(`${pngCount} png`);
    if (rasterizedCount) parts.push(`${rasterizedCount} auto-converted to png`);
    return parts.join(" + ");
  }, [frames]);

  const totalFrames = frames.length * options.hold;
  const durationS = (totalFrames / options.fr).toFixed(2);

  // Rebuild the preview whenever the order, frame set, or options change
  // (debounced so dragging through several positions doesn't rebuild on
  // every intermediate frame).
  useEffect(() => {
    if (!frames.length) {
      setPreviewData(null);
      return;
    }
    const handle = setTimeout(() => {
      try {
        const data = buildLottie(frames, name, options);
        setPreviewData(data);
      } catch (err) {
        console.error("preview build failed", err);
      }
    }, 150);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, options.fr, options.hold, options.size, name]);

  async function handleExportLottie() {
    setExporting("lottie");
    try {
      const lottieJson = previewData || buildLottie(frames, name, options);
      const blob = await buildDotLottie(lottieJson, name);
      downloadBlob(name + ".lottie", blob);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportJson() {
    setExporting("json");
    try {
      const lottieJson = previewData || buildLottie(frames, name, options);
      const blob = new Blob([JSON.stringify(lottieJson)], { type: "application/json" });
      downloadBlob(name + ".json", blob);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="job-card">
      <div className="job-header">
        <div>
          <p className="job-name">{name}</p>
          <p className="job-stats">
            <b>{frames.length}</b> frames ({typeBreakdown}) · <b>{durationS}s</b> @ {options.fr}fps
          </p>
        </div>
        <div className="job-actions">
          <button className="dl" onClick={handleExportJson} disabled={exporting !== null || !frames.length}>
            {exporting === "json" ? "Exporting…" : "Export .json"}
          </button>
          <button className="dl filled" onClick={handleExportLottie} disabled={exporting !== null || !frames.length}>
            {exporting === "lottie" ? "Exporting…" : "Export .lottie"}
          </button>
          <button
            className="job-delete"
            onClick={onRemove}
            disabled={exporting !== null}
            aria-label={`Remove ${name} and its frames`}
            title="Remove this sequence"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="job-body">
        <div className="job-preview">
          {previewData ? (
            <LottiePreview animationData={previewData} />
          ) : (
            <div className="job-preview-empty">no frames</div>
          )}
        </div>
        <div className="job-timeline-wrap">
          <p className="job-timeline-label">drag to reorder · × to remove</p>
          <Timeline frames={frames} onChange={(next) => onFramesChange(next)} />
        </div>
      </div>
    </div>
  );
}
