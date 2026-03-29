"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
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

// ✅ Compute SHA-256 hash of file content
async function getFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function FileUpload() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [duplicateFile, setDuplicateFile] = useState<FileType | null>(null); // 👈 store conflict info
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: files = [], isLoading } = useQuery<FileType[]>({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await fetch("/api/files/fetch");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // ✅ Compute hash before requesting presigned URL
      const hash = await getFileHash(file);

      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          folderId: null,
          hash, // 👈 send hash to server
        }),
      });

      // ✅ Handle 409 duplicate response
      if (res.status === 409) {
        const data = await res.json();
        throw { isDuplicate: true, existingFile: data.existingFile };
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();

      await fetch(data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      return data;
    },
   onSuccess: (data) => {
  queryClient.setQueryData(["files"], (old: any) => [
    { ...data.file, status: "uploaded" }, // 👈 optimistically treat as uploaded
    ...(old || []),
  ]);
     setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["files"] });
  }, 3000);
  }});

  const getFileUrl = async (key: string) => {
    const res = await fetch("/api/files/fetch/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    return data.url;
  };

  const handleFile = async (file: File) => {
    setStatus("uploading");
    setProgress(0);
    setErrorMsg("");
    setDuplicateFile(null);

    let interval: NodeJS.Timeout;

    try {
      interval = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 10 : p));
      }, 150);

      await uploadMutation.mutateAsync(file);

      clearInterval(interval);
      setProgress(100);
      setStatus("success");
    } catch (err: any) {
      clearInterval(interval!);

      // ✅ Distinguish duplicate vs generic error
      if (err?.isDuplicate) {
        setStatus("duplicate");
        setDuplicateFile(err.existingFile ?? null);
      } else {
        setStatus("error");
        setErrorMsg(err?.message || "Upload failed");
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
  };

  return (
    <div className="file-upload-container">
      <div className="file-upload-wrapper">
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          style={{
            minHeight: "200px",
            border: "2px dashed #ccc",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" hidden onChange={onInputChange} />

          {status === "idle" && <p>Drop file or click to upload</p>}
          {status === "uploading" && <p>Uploading... {progress}%</p>}
          {status === "success" && <p>✅ Uploaded</p>}
          {status === "error" && <p>❌ {errorMsg}</p>}

          {/* ✅ Duplicate warning with link to existing file */}
          {status === "duplicate" && (
            <div onClick={(e) => e.stopPropagation()}>
              <p>⚠️ This file already exists in this folder.</p>
              {duplicateFile && (
                <button
                  onClick={async () => {
                    const url = await getFileUrl(duplicateFile.storageUrl);
                    window.open(url, "_blank");
                  }}
                >
                  Open existing: {duplicateFile.filename}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="files-section">
        <h3>Your Files</h3>
        {isLoading ? (
          <p>Loading...</p>
        ) : files.length === 0 ? (
          <p>No files yet</p>
        ) : (
          files
            .filter((f) => f.status === "uploaded")
            .map((file) => (
              <div key={file._id}>
                <p>{file.filename}</p>
                <button
                  onClick={async () => {
                    const url = await getFileUrl(file.storageUrl);
                    window.open(url, "_blank");
                  }}
                >
                  Open
                </button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}