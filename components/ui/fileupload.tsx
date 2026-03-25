"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";




const handleFile = async (file: File) => { // `file` is the browser File object
  const res = await fetch("/api/files/upload", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,    
      mimeType: file.type,    
      size: file.size,        
      folderId: null,
    }),
  });

  const data = await res.json();

  await fetch(data.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
};
type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadedFile {
  name: string;
  size: number;
  url?: string;
}



export default function FileUpload() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

 const handleFile = async (file: File) => {
  setStatus("uploading");
  setProgress(0);
  setErrorMsg("");

  try {
    const interval = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 10 : p));
    }, 150);

    // ✅ Step 1: send metadata as JSON → your Next.js API
    const res = await fetch("/api/files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        folderId: null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Upload failed");
    }

    const data = await res.json(); // gets back { uploadUrl, ... }

    // ✅ Step 2: send the actual file binary → cloud storage (S3/Appwrite etc.)
    await fetch(data.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    clearInterval(interval);
    setProgress(100);
    setUploadedFile({ name: file.name, size: file.size, url: data.url });
    setStatus("success");
  } catch (err: any) {
    setStatus("error");
    setErrorMsg(err.message || "Something went wrong");
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
  };

  const reset = () => {
    setStatus("idle");
    setUploadedFile(null);
    setProgress(0);
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="file-upload-wrapper">
      {status === "idle" || status === "uploading" ? (
        <div
          className={`drop-zone ${dragging ? "dragging" : ""} ${status === "uploading" ? "uploading" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => status === "idle" && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden-input"
            onChange={onInputChange}
          />

          {status === "idle" ? (
            <>
              <div className="upload-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="drop-title">Drop your file here</p>
              <p className="drop-sub">or <span className="browse-link">browse</span> to choose a file</p>
            </>
          ) : (
            <div className="progress-area">
              <p className="uploading-name">Uploading...</p>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-pct">{progress}%</p>
            </div>
          )}
        </div>
      ) : status === "success" && uploadedFile ? (
        <div className="result-card success">
          <div className="result-icon success-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="result-info">
            <p className="result-filename">{uploadedFile.name}</p>
            <p className="result-size">{formatSize(uploadedFile.size)}</p>
          </div>
          <button className="reset-btn" onClick={reset}>Upload another</button>
        </div>
      ) : (
        <div className="result-card error">
          <div className="result-icon error-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div className="result-info">
            <p className="result-filename">Upload failed</p>
            <p className="result-size">{errorMsg}</p>
          </div>
          <button className="reset-btn" onClick={reset}>Try again</button>
        </div>
      )}

      <style>{`
        .file-upload-wrapper {
          width: 100%;
          max-width: 480px;
          font-family: 'DM Sans', sans-serif;
        }
        .drop-zone {
          border: 2px dashed #d1d5db;
          border-radius: 16px;
          padding: 48px 32px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          background: #fafafa;
        }
        .drop-zone:hover, .drop-zone.dragging {
          border-color: #6366f1;
          background: #f5f3ff;
        }
        .drop-zone.uploading {
          cursor: default;
          pointer-events: none;
        }
        .hidden-input { display: none; }
        .upload-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
          color: #6366f1;
        }
        .drop-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 6px;
        }
        .drop-sub {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }
        .browse-link {
          color: #6366f1;
          font-weight: 500;
          text-decoration: underline;
          cursor: pointer;
        }
        .progress-area { width: 100%; }
        .uploading-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: #374151;
          margin: 0 0 12px;
        }
        .progress-bar-track {
          width: 100%;
          height: 6px;
          background: #e5e7eb;
          border-radius: 999px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: #6366f1;
          border-radius: 999px;
          transition: width 0.2s ease;
        }
        .progress-pct {
          font-size: 0.8rem;
          color: #6b7280;
          margin: 8px 0 0;
          text-align: right;
        }
        .result-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: 16px;
          border: 1px solid;
        }
        .result-card.success {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }
        .result-card.error {
          background: #fef2f2;
          border-color: #fecaca;
        }
        .result-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .success-icon { background: #dcfce7; color: #16a34a; }
        .error-icon { background: #fee2e2; color: #dc2626; }
        .result-info { flex: 1; min-width: 0; }
        .result-filename {
          font-size: 0.9rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .result-size {
          font-size: 0.8rem;
          color: #6b7280;
          margin: 0;
        }
        .reset-btn {
          flex-shrink: 0;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: white;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          color: #374151;
          transition: background 0.15s;
        }
        .reset-btn:hover { background: #f3f4f6; }
      `}</style>
    </div>
  );
}
