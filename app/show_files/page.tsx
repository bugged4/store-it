"use client";

import { useQuery } from "@tanstack/react-query";

type FileType = {
  _id: string;
  filename: string;
  mimetype: string;
  size: number;
  storageUrl: string;
  folders_id: string | null;
  status: "pending" | "uploaded";
  createdAt: string;
};

type FolderType = {
  _id: string;
  name: string;
  parentfolder_id: string | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function ShowFilesPage() {
  // 🔥 Fetch files
  const { data: files = [] } = useQuery<FileType[]>({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await fetch("/api/files/fetch");
      return res.json();
    },
  });

  // 🔥 Fetch folders
  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: ["folders"],
    queryFn: async () => {
      const res = await fetch("/api/folder/fetch");
      return res.json();
    },
  });

  // ✅ Only uploaded files
  const uploadedFiles = files.filter(f => f.status === "uploaded");

  // 🔥 Group files by folder
  const grouped: Record<string, { name: string; files: FileType[] }> = {};

  // Root folder
  grouped["root"] = { name: "🏠 Root", files: [] };

  folders.forEach(folder => {
    grouped[folder._id] = {
      name: `📁 ${folder.name}`,
      files: []
    };
  });

  uploadedFiles.forEach(file => {
    const key = file.folders_id || "root";
    if (!grouped[key]) {
      grouped[key] = { name: "Unknown", files: [] };
    }
    grouped[key].files.push(file);
  });

  return (
    <div style={{ padding: 40, background: "#0d0f14", minHeight: "100vh", color: "white" }}>
      <h1>📂 Your Files</h1>

      {Object.entries(grouped).map(([folderId, folder]) => (
        <div key={folderId} style={{ marginBottom: 30 }}>
          <h2 style={{ color: "#6c8eff" }}>{folder.name}</h2>

          {folder.files.length === 0 ? (
            <p style={{ color: "#777" }}>No files</p>
          ) : (
            folder.files.map(file => (
              <div
                key={file._id}
                style={{
                  padding: 10,
                  border: "1px solid #252a38",
                  borderRadius: 8,
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between"
                }}
              >
                <span>
                  {file.filename} ({formatBytes(file.size)})
                </span>

                <button
                  onClick={async () => {
                    const res = await fetch("/api/files/fetch/url", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key: file.storageUrl }),
                    });

                    const { url } = await res.json();
                    window.open(url, "_blank");
                  }}
                >
                  Open
                </button>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}