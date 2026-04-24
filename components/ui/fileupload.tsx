"use client";
import { useRouter } from "next/navigation";

// Files below this size use a single presigned PUT (matches upload/route MAX_SIZE)
// Files at or above this size use multipart (init → presign parts → upload → complete)
const SMALL_FILE_LIMIT = 10 * 1024 * 1024;  // 10MB
const CHUNK_SIZE       = 10 * 1024 * 1024;  // 10MB per part (matches init/route CHUNK_SIZE)

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type UploadStatus = "idle" | "uploading" | "success" | "error" | "duplicate";

type FileType = {
  _id: string;
  filename: string;
  mimetype: string;
  size: number;
  storageUrl: string;
  owner_id: string;
  status: "pending" | "uploaded";
  createdAt: string;
};

async function getFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "🖼";
  if (mimetype.startsWith("video/")) return "🎬";
  if (mimetype.startsWith("audio/")) return "🎵";
  if (mimetype.includes("pdf")) return "📄";
  if (mimetype.includes("zip") || mimetype.includes("compressed")) return "🗜";
  if (mimetype.includes("word") || mimetype.includes("document")) return "📝";
  if (mimetype.includes("sheet") || mimetype.includes("excel")) return "📊";
  return "📁";
}

export default function FileUpload() {
    const router = useRouter();
  const [dragging, setDragging]         = useState(false);
  const [status, setStatus]             = useState<UploadStatus>("idle");
  const [errorMsg, setErrorMsg]         = useState("");
  const [progress, setProgress]         = useState(0);
  const [duplicateFile, setDuplicateFile] = useState<FileType | null>(null);
  const [toast, setToast]               = useState<{ msg: string; type: "error" | "warn" | "success" } | null>(null);

  const inputRef   = useRef<HTMLInputElement>(null);
  const cancelRef  = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const { data: files = [], isLoading } = useQuery<FileType[]>({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await fetch("/api/files/fetch");
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const uploadedFiles = files.filter((f) => f.status === "uploaded");

  // ── Helper: parse error responses consistently ────────────────────────────
  async function parseError(res: Response, fallback: string) {
    const data = await res.json().catch(() => ({}));
    return new Error(data.error || fallback);
  }

  // ── Small file: single presigned PUT ─────────────────────────────────────
  // upload/route returns { uploadUrl, fileId, key }
  // confirm/route expects { fileId }
  const smallUploadMutation = useMutation({
    mutationFn: async ({ file, hash }: { file: File; hash: string }) => {
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          folderId: null,
          hash,
        }),
      });

      if (cancelRef.current) throw { isCancelled: true };

      if (res.status === 409) {
        const data = await res.json();
        throw { isDuplicate: true, existingFile: data.existingFile };
      }
      if (res.status === 413) throw new Error("File exceeds 10MB — use a smaller file");
      if (res.status === 401) throw new Error("Session expired, please log in again");
      if (res.status === 400) throw await parseError(res, "Invalid file data");
      if (res.status === 500) throw await parseError(res, "Server error, please try again");
      if (!res.ok)            throw await parseError(res, `Upload failed (${res.status})`);

      const { uploadUrl, fileId } = (await res.json()) as {
        uploadUrl: string;
        fileId: string;
        key: string;
      };

      if (cancelRef.current) throw { isCancelled: true };

      // PUT directly to S3
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Failed to upload file to storage");

      if (cancelRef.current) throw { isCancelled: true };

      // Confirm — marks DB record as "uploaded" + updates quota
      const confirmRes = await fetch("/api/files/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!confirmRes.ok) throw new Error("Failed to confirm upload");

      return confirmRes.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });

  // ── Large file: S3 multipart ──────────────────────────────────────────────
  // init    → POST /api/files/upload/multipart/init    { filename, mimeType, size, folderId, hash }
  //           returns { uploadId, key, totalParts, fileId }
  // presign → POST /api/files/upload/multipart/presign { key, uploadId, partNumbers }
  //           returns { urls: string[] }
  // complete→ POST /api/files/upload/multipart/complete { key, uploadId, parts, fileId }
  //           returns { file }
  async function multipartUpload(
    file: File,
    hash: string,
    onProgress: (pct: number) => void
  ) {
    // 1. Init
    const initRes = await fetch("/api/files/upload/multipart/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        folderId: null,
        hash,
      }),
    });

    if (cancelRef.current) throw { isCancelled: true };

    if (initRes.status === 409) {
      const data = await initRes.json();
      throw { isDuplicate: true, existingFile: data.existingFile };
    }
    if (initRes.status === 413) throw new Error("Storage limit exceeded");
    if (initRes.status === 401) throw new Error("Session expired, please log in again");
    if (!initRes.ok) throw await parseError(initRes, "Failed to initialise multipart upload");

    const { uploadId, key, totalParts, fileId } = await initRes.json();

    // 2. Get presigned URLs for every part
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);

    const presignRes = await fetch("/api/files/upload/multipart/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, uploadId, partNumbers }),
    });

    if (cancelRef.current) throw { isCancelled: true };
    if (!presignRes.ok) throw new Error("Failed to get presigned URLs");

    const { urls } = (await presignRes.json()) as { urls: string[] };

    // 3. Upload each chunk, tracking real progress
    let uploadedBytes = 0;

    const parts = await Promise.all(
      urls.map(async (url, i) => {
        if (cancelRef.current) throw { isCancelled: true };

        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, start + CHUNK_SIZE);

        const res = await fetch(url, { method: "PUT", body: chunk });
        if (!res.ok) throw new Error(`Failed to upload part ${i + 1}`);

        // ETag is required by S3 to assemble the final object
        const ETag = res.headers.get("ETag") ?? "";

        uploadedBytes += chunk.size;
        onProgress(Math.round((uploadedBytes / file.size) * 100));

        return { PartNumber: i + 1, ETag };
      })
    );

    if (cancelRef.current) throw { isCancelled: true };

    // 4. Complete — S3 assembles parts, DB record marked "uploaded"
    const completeRes = await fetch("/api/files/upload/multipart/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, uploadId, parts, fileId }),
    });
    if (!completeRes.ok) throw new Error("Failed to complete multipart upload");

    queryClient.invalidateQueries({ queryKey: ["files"] });
    return completeRes.json();
  }

  // ── Route to the right strategy ───────────────────────────────────────────
  async function uploadSmart(file: File, hash: string, onProgress: (pct: number) => void) {
    if (file.size < SMALL_FILE_LIMIT) {
      return smallUploadMutation.mutateAsync({ file, hash });
    }
    return multipartUpload(file, hash, onProgress);
  }

  // ── fetch/url/route expects { key }, returns { url } ─────────────────────
  const getFileUrl = async (key: string): Promise<string> => {
    const res = await fetch("/api/files/fetch/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) throw new Error("Failed to get file URL");
    return (await res.json()).url;
  };

  const handleCancel = () => {
    cancelRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus("idle");
    setProgress(0);
    setToast({ msg: "Upload cancelled.", type: "warn" });
  };

  const handleFile = async (file: File) => {
    setStatus("uploading");
    setProgress(0);
    setErrorMsg("");
    setDuplicateFile(null);
    cancelRef.current = false;

    // For small files: fake ticker (no real progress from a single PUT)
    // For large files: real progress via onProgress callback; ticker is stopped on first callback
    if (file.size < SMALL_FILE_LIMIT) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 8 : p));
      }, 150);
    }

    try {
      const hash = await getFileHash(file);

      await uploadSmart(file, hash, (pct) => {
        // Switch from fake ticker to real progress (multipart only)
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setProgress(pct);
      });

      if (intervalRef.current) clearInterval(intervalRef.current);

      if (!cancelRef.current) {
        setProgress(100);
        setStatus("success");
        setToast({ msg: `"${file.name}" uploaded successfully!`, type: "success" });
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch (err: any) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (err?.isCancelled) return;
      if (err?.isDuplicate) {
        setStatus("duplicate");
        setDuplicateFile(err.existingFile ?? null);
        setToast({ msg: "This file already exists in your storage.", type: "warn" });
      } else {
        setStatus("error");
        setErrorMsg(err?.message || "Upload failed");
        setToast({ msg: err?.message || "Upload failed.", type: "error" });
      }
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .fu-root {
          --bg: #0d0f14; --surface: #13161e; --surface2: #1a1e28;
          --border: #252a38; --border-hover: #353c52;
          --accent: #6c8eff; --accent-glow: rgba(108,142,255,0.18); --accent2: #a78bfa;
          --success: #34d399; --warn: #fbbf24; --error: #f87171;
          --text: #e8eaf0; --text-muted: #6b7280; --text-dim: #9ca3af;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg); min-height: 100vh; padding: 48px 24px; color: var(--text);
        }
        .fu-page { max-width: 680px; margin: 0 auto; }
        .fu-header { margin-bottom: 36px; }
        .fu-header h1 {
          font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #e8eaf0 0%, #6c8eff 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; margin-bottom: 6px;
        }
        .fu-header p { color: var(--text-muted); font-size: 0.9rem; font-weight: 300; }

        .fu-dropzone {
          background: var(--surface); border: 1.5px dashed var(--border);
          border-radius: 16px; padding: 48px 32px;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 12px; cursor: pointer;
          transition: all 0.2s ease; position: relative; overflow: hidden;
          min-height: 220px; text-align: center;
        }
        .fu-dropzone::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 0%, var(--accent-glow) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.3s;
        }
        .fu-dropzone:hover::before, .fu-dropzone.dragging::before { opacity: 1; }
        .fu-dropzone:hover, .fu-dropzone.dragging {
          border-color: var(--accent); border-style: solid; transform: translateY(-1px);
        }
        .fu-dropzone-icon {
          width: 56px; height: 56px; background: var(--surface2);
          border: 1px solid var(--border); border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; margin-bottom: 4px; transition: transform 0.2s;
        }
        .fu-dropzone:hover .fu-dropzone-icon { transform: scale(1.08); }
        .fu-dropzone-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 600; color: var(--text); }
        .fu-dropzone-sub { font-size: 0.8rem; color: var(--text-muted); }
        .fu-dropzone-sub span { color: var(--accent); font-weight: 500; }

        .fu-progress-wrap { width: 100%; display: flex; flex-direction: column; gap: 10px; }
        .fu-progress-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
        .fu-progress-label { color: var(--text-dim); font-weight: 500; }
        .fu-progress-pct { color: var(--accent); font-family: 'Syne', sans-serif; font-weight: 700; }
        .fu-bar-bg { width: 100%; height: 5px; background: var(--surface2); border-radius: 99px; overflow: hidden; }
        .fu-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent) 0%, var(--accent2) 100%);
          border-radius: 99px; transition: width 0.15s ease;
          box-shadow: 0 0 8px var(--accent-glow);
        }
        .fu-cancel-btn {
          align-self: center; background: transparent;
          border: 1px solid var(--border); color: var(--text-muted);
          font-family: 'DM Sans', sans-serif; font-size: 0.78rem;
          padding: 5px 14px; border-radius: 8px; cursor: pointer; transition: all 0.15s;
        }
        .fu-cancel-btn:hover { border-color: var(--error); color: var(--error); }

        .fu-status { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 500; }
        .fu-status.success { color: var(--success); }
        .fu-status.error { color: var(--error); }
        .fu-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: currentColor; animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }

        .fu-duplicate {
          background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.25);
          border-radius: 10px; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 10px; width: 100%; text-align: left;
        }
        .fu-duplicate-title { font-size: 0.85rem; font-weight: 600; color: var(--warn); display: flex; align-items: center; gap: 6px; }
        .fu-duplicate-sub { font-size: 0.78rem; color: var(--text-muted); }
        .fu-dup-open-btn {
          background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3);
          color: var(--warn); font-family: 'DM Sans', sans-serif;
          font-size: 0.78rem; font-weight: 500; padding: 6px 14px;
          border-radius: 7px; cursor: pointer; transition: all 0.15s; align-self: flex-start;
        }
        .fu-dup-open-btn:hover { background: rgba(251,191,36,0.2); }

        .fu-files { margin-top: 36px; }
        .fu-files-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .fu-files-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text); }
        .fu-files-count {
          font-size: 0.75rem; background: var(--surface2);
          border: 1px solid var(--border); color: var(--text-muted);
          padding: 2px 10px; border-radius: 99px;
        }
        .fu-file-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px;
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 8px; transition: all 0.15s;
        }
        .fu-file-card:hover { border-color: var(--border-hover); transform: translateX(3px); }
        .fu-file-icon {
          font-size: 22px; flex-shrink: 0; width: 40px; height: 40px;
          background: var(--surface2); border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .fu-file-info { flex: 1; overflow: hidden; }
        .fu-file-name { font-size: 0.875rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fu-file-meta { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
        .fu-file-open {
          background: var(--surface2); border: 1px solid var(--border);
          color: var(--accent); font-family: 'DM Sans', sans-serif;
          font-size: 0.75rem; font-weight: 500; padding: 6px 13px;
          border-radius: 8px; cursor: pointer; transition: all 0.15s;
          white-space: nowrap; flex-shrink: 0;
        }
        .fu-file-open:hover { background: var(--accent-glow); border-color: var(--accent); }

        .fu-empty { text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 0.85rem; }
        .fu-empty-icon { font-size: 2rem; margin-bottom: 10px; opacity: 0.4; }

        .fu-toast {
          position: fixed; bottom: 28px; right: 28px;
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px 18px;
          font-size: 0.82rem; font-weight: 500;
          display: flex; align-items: center; gap: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          animation: slideUp 0.25s ease; z-index: 999; max-width: 320px;
        }
        .fu-toast.success { border-color: rgba(52,211,153,0.3); color: var(--success); }
        .fu-toast.warn    { border-color: rgba(251,191,36,0.3);  color: var(--warn); }
        .fu-toast.error   { border-color: rgba(248,113,113,0.3); color: var(--error); }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .fu-skeleton {
          height: 64px;
          background: linear-gradient(90deg, var(--surface) 25%, var(--surface2) 50%, var(--surface) 75%);
          background-size: 200% 100%; animation: shimmer 1.4s infinite;
          border-radius: 12px; margin-bottom: 8px;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="fu-root">
        <div className="fu-page">

          <div className="fu-header">
            <h1>Your Storage</h1>
            <p>Drop files to upload, or browse from your device.</p>
             <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
    <button
      onClick={() => router.push("/showfiles")}
      style={{
        padding: "8px 14px",
        borderRadius: "8px",
        border: "1px solid #252a38",
        background: "#1a1e28",
        color: "#6c8eff",
        cursor: "pointer",
      }}
    >
      📂 View All Files
    </button>
  </div>
          </div>

          <div
            className={`fu-dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => status !== "uploading" && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" hidden onChange={onInputChange} />

            {status === "idle" && (
              <>
                <div className="fu-dropzone-icon">☁️</div>
                <div className="fu-dropzone-title">Drop your file here</div>
                <div className="fu-dropzone-sub">
                  or <span>browse</span> to choose · files under 10MB upload instantly, larger files use multipart
                </div>
              </>
            )}

            {status === "uploading" && (
              <div className="fu-progress-wrap" onClick={(e) => e.stopPropagation()}>
                <div className="fu-progress-row">
                  <span className="fu-progress-label">Uploading…</span>
                  <span className="fu-progress-pct">{progress}%</span>
                </div>
                <div className="fu-bar-bg">
                  <div className="fu-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <button className="fu-cancel-btn" onClick={handleCancel}>✕ Cancel</button>
              </div>
            )}

            {status === "success" && (
              <div className="fu-status success">
                <div className="fu-status-dot" />
                File uploaded successfully
              </div>
            )}

            {status === "error" && (
              <>
                <div className="fu-status error">✕ {errorMsg || "Upload failed"}</div>
                <div className="fu-dropzone-sub" style={{ marginTop: 4 }}>Click to try again</div>
              </>
            )}

            {status === "duplicate" && (
              <div className="fu-duplicate" onClick={(e) => e.stopPropagation()}>
                <div className="fu-duplicate-title">⚠ Duplicate file detected</div>
                <div className="fu-duplicate-sub">
                  This file already exists in your storage.
                  {duplicateFile &&
                    ` "${duplicateFile.filename}" was uploaded on ${new Date(duplicateFile.createdAt).toLocaleDateString()}.`}
                </div>
                {duplicateFile && (
                  <button
                    className="fu-dup-open-btn"
                    onClick={async () => {
                      const url = await getFileUrl(duplicateFile.storageUrl);
                      window.open(url, "_blank");
                    }}
                  >
                    Open existing file →
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="fu-files">
            <div className="fu-files-header">
              <span className="fu-files-title">Uploaded Files</span>
              {!isLoading && (
                <span className="fu-files-count">
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {isLoading ? (
              <>
                <div className="fu-skeleton" />
                <div className="fu-skeleton" />
                <div className="fu-skeleton" />
              </>
            ) : uploadedFiles.length === 0 ? (
              <div className="fu-empty">
                <div className="fu-empty-icon">📂</div>
                <div>No files uploaded yet</div>
              </div>
            ) : (
              uploadedFiles.map((file) => (
                <div key={file._id} className="fu-file-card">
                  <div className="fu-file-icon">{getFileIcon(file.mimetype)}</div>
                  <div className="fu-file-info">
                    <div className="fu-file-name">{file.filename}</div>
                    <div className="fu-file-meta">
                      {formatBytes(file.size)} ·{" "}
                      {new Date(file.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </div>
                  </div>
                  <button
                    className="fu-file-open"
                    onClick={async () => {
                      const url = await getFileUrl(file.storageUrl);
                      window.open(url, "_blank");
                    }}
                  >
                    Open ↗
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fu-toast ${toast.type}`}>
          {toast.type === "success" ? "✓" : toast.type === "warn" ? "⚠" : "✕"}{" "}
          {toast.msg}
        </div>
      )}
    </>
  );
}