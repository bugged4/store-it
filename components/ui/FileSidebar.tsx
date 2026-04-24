"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type FileType = "all" | "images" | "docs" | "videos";

interface StoredFile {
  _id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
}

function getCategory(file: StoredFile): "images" | "docs" | "videos" | "misc" {
  const mime = file.mimetype || "";
  if (mime.startsWith("image/")) return "images";
  if (mime.startsWith("video/")) return "videos";
  if (mime.startsWith("audio/") || mime.includes("pdf") || mime.includes("word") || mime.includes("text"))
    return "docs";
  return "misc";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/"))
    return <div className="file-icon icon-img">🖼</div>;
  if (mime.startsWith("video/"))
    return <div className="file-icon icon-vid">🎬</div>;
  if (mime.includes("pdf"))
    return <div className="file-icon icon-pdf">📕</div>;
  return <div className="file-icon icon-doc">📄</div>;
}

function FilePreview({ file }: { file: StoredFile }) {
  const cat = getCategory(file);

  if (cat === "images") {
    return (
      <div className="preview-media">
        <Image
          src={file.url}
          alt={file.originalName}
          fill
          className="object-contain rounded-lg"
        />
      </div>
    );
  }

  if (cat === "videos") {
    return (
      <video
        src={file.url}
        controls
        className="w-full rounded-lg max-h-64 bg-black"
      />
    );
  }

  if (file.mimetype?.includes("pdf")) {
    return (
      <iframe
        src={file.url}
        className="w-full h-64 rounded-lg border border-border"
        title={file.originalName}
      />
    );
  }

  return (
    <div className="preview-placeholder">
      <span className="text-4xl">📄</span>
      <p className="text-sm text-muted-foreground mt-2">No preview available</p>
    </div>
  );
}

export default function FileSidebar() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [tab, setTab] = useState<FileType>("all");
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/files/fetch")
      .then((r) => r.json())
      .then((data) => {
        setFiles(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs: { label: string; value: FileType }[] = [
    { label: "All", value: "all" },
    { label: "Images", value: "images" },
    { label: "Docs", value: "docs" },
    { label: "Videos", value: "videos" },
  ];

  const filtered = tab === "all"
    ? files
    : files.filter((f) => getCategory(f) === tab);

  return (
    <div className="sidebar-wrapper">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="sidebar-label">Storage</p>
          <div className="tabs">
            {tabs.map((t) => (
              <button
                key={t.value}
                className={`tab ${tab === t.value ? "active" : ""}`}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="file-list">
          {loading && (
            <li className="empty-state">Loading…</li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="empty-state">No files found</li>
          )}
          {filtered.map((file) => (
            <li
              key={file._id}
              className={`file-item ${selected?._id === file._id ? "active" : ""}`}
              onClick={() => setSelected(file)}
            >
              <FileIcon mime={file.mimetype} />
              <div className="file-info">
                <p className="file-name">{file.originalName}</p>
                <p className="file-meta">
                  {formatSize(file.size)} · {formatDate(file.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Preview Panel ── */}
      <section className="preview-panel">
        {selected ? (
          <>
            <div className="preview-header">
              <p className="preview-filename">{selected.originalName}</p>
              <p className="preview-sub">
                {getCategory(selected)} · {formatSize(selected.size)}
              </p>
            </div>
            <div className="preview-body">
              <FilePreview file={selected} />
            </div>
            <div className="preview-actions">
              <button
                href={selected.url}
                download={selected.originalName}
                className="btn btn-primary"
              >
                Download
              </a>
              <button
                className="btn"
                onClick={() => navigator.clipboard.writeText(selected.url)}
              >
                Copy link
              </button>
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <p>Select a file to preview</p>
          </div>
        )}
      </section>
    </div>
  );
}