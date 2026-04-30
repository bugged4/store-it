"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "next-auth/react";

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
  parent_id: string | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function ShowFilesPage() {
  const queryClient = useQueryClient();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";

  const [folderName, setFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  // 📂 Fetch files
  const { data: files = [] } = useQuery<FileType[]>({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await fetch("/api/files/fetch");
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  // 📁 Fetch folders
  const {
    data: folders = [],
    isLoading: foldersLoading,
    isError: foldersError,
  } = useQuery<FolderType[]>({
    queryKey: ["folders"],
    queryFn: async () => {
      const res = await fetch("/api/folders");
      if (!res.ok) throw new Error("Failed to fetch folders");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  // 🚀 Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName.trim(),
          parent_id: selectedFolderId ?? null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create folder");
      return data;
    },
    onSuccess: () => {
      setFolderName("");
      setShowInput(false);
      queryClient.invalidateQueries({ queryKey: ["folders"] }); // 🔥 auto refresh
    },
  });

  // ✅ Only uploaded files
  const uploadedFiles = files.filter(f => f.status === "uploaded");

  // 🔥 Group files
  const grouped: Record<string, { name: string; files: FileType[] }> = {};

  grouped["root"] = { name: "🏠 Root", files: [] };

  folders.forEach(folder => {
    grouped[folder._id] = {
      name: `📁 ${folder.name}`,
      files: [],
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

      {/* 🚨 No folders */}
      {(foldersError || (!foldersLoading && folders.length === 0)) && (
        <div style={{ marginBottom: 30 }}>
          <p style={{ color: "#ff6b6b" }}>No folders created</p>
        </div>
      )}

      {/* ➕ Create Folder Button */}
      <button
        onClick={() => setShowInput(!showInput)}
        style={{
          padding: "10px 16px",
          background: "#6c8eff",
          border: "none",
          borderRadius: 6,
          color: "white",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        ➕ Create Folder
      </button>

      {/* ✏️ Input UI */}
      {showInput && (
        <div style={{ marginBottom: 20 }}>
          <input
            value={folderName}
            onChange={e => setFolderName(e.target.value)}
            placeholder="Folder name"
            style={{
              padding: 8,
              marginRight: 8,
              borderRadius: 4,
              border: "1px solid #333",
              background: "#1a1d25",
              color: "white",
            }}
          />

          <button
            onClick={() => createFolderMutation.mutate()}
            style={{
              padding: "8px 12px",
              background: "#4CAF50",
              border: "none",
              borderRadius: 4,
              color: "white",
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* 📁 Files grouped by folder */}
      {Object.entries(grouped).map(([folderId, folder]) => (
        <div key={folderId} style={{ marginBottom: 30 }}>
          <h2
            style={{ color: "#6c8eff", cursor: "pointer" }}
            onClick={() => setSelectedFolderId(folderId === "root" ? null : folderId)}
          >
            {folder.name}
          </h2>

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
                  justifyContent: "space-between",
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
