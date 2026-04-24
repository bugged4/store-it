import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import { s3, BUCKET } from "@/lib/s3";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import File from "@/models/File";
import User from "@/models/User";

const CHUNK_SIZE = 10 * 1024 * 1024; // must match frontend

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { filename, mimeType, size, folderId = null, hash } = body as {
    filename: string;
    mimeType: string;
    size: number;
    folderId: string | null;
    hash: string;
  };

  if (!filename || !mimeType || !size || !hash) {
    return NextResponse.json(
      { error: "filename, mimeType, size, and hash are required" },
      { status: 400 }
    );
  }

  await connectDB();

  const user = await User.findOne({ email: session.user.email });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
    console.log("usernotfoundd")
  }

  if (!user.hasEnoughStorage(size)) {
    return NextResponse.json({ error: "Storage limit exceeded" }, { status: 413 });
  }

  const existing = await File.findOne({ hash, owner_id: user._id, status: "uploaded" });
  if (existing) {
    return NextResponse.json(
      { error: "Duplicate file", existingFile: existing },
      { status: 409 }
    );
  }

  const key = `uploads/${user._id}/${Date.now()}-${filename}`;

  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
    })
  );

  if (!UploadId) {
    return NextResponse.json(
      { error: "Failed to initiate multipart upload" },
      { status: 500 }
    );
  }

  const file = await File.create({
    filename,
    hash,
    owner_email: user.email,
    owner_id: user._id,
    mimetype: mimeType,
    size,
    storageUrl: key,
    destination: key,
    uploadId: UploadId,
    folders_id: folderId ?? null,
    status: "pending",
  });

  const totalParts = Math.ceil(size / CHUNK_SIZE);

  return NextResponse.json(
    { uploadId: UploadId, key, totalParts, fileId: file._id.toString() },
    { status: 200 }
  );
}