// app/api/files/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import connectMongoose from "@/lib/mongoose";
import { authOptions } from "@/lib/[...nextauth]";          // ← fixed path
import { s3, BUCKET } from "@/lib/s3";
import File from "@/models/File";
import Folder from "@/models/Folder";

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err: any = new Error("Unauthorised");
    err.status = 401;
    throw err;
  }
  return session.user.id;   // ← returns string, not { userId }
}

// ── PATCH /api/files/:id ──────────────────────────────────────────────────────
// Body: { folderId: string | null }
// Moves the file into the given folder, or to root when folderId is null.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();   // ← plain string, not destructured

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || !("folderId" in body)) {
      return NextResponse.json({ error: "folderId is required" }, { status: 400 });
    }

    const { folderId } = body as { folderId: string | null };

    await connectMongoose();

    // ── 1. Verify file ownership ───────────────────────────────────────────
    const file = await File.findOne({
      _id:      params.id,
      owner_id: userId,
    }).lean();

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // ── 2. If a target folder is given, verify it also belongs to this user ─
    if (folderId !== null) {
      if (!ObjectId.isValid(folderId)) {
        return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
      }

      const folder = await Folder.findOne({
        _id:      folderId,
        owner_id: userId,
      }).lean();

      if (!folder) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
      }
    }

    // ── 3. Update the file record ──────────────────────────────────────────
    const updated = await File.findOneAndUpdate(
      { _id: params.id },
      { $set: { folderId: folderId ?? null, updatedAt: new Date() } },
      { new: true }           // ← Mongoose equivalent of returnDocument: "after"
    ).lean();

    return NextResponse.json({ file: updated });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[PATCH /api/files/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/files/:id ─────────────────────────────────────────────────────
// Removes the file record from MongoDB and deletes the object from S3.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();   // ← was requireAuth(req) which doesn't exist

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
    }

    await connectMongoose();

    // ── 1. Verify ownership and fetch S3 key ──────────────────────────────
    const file = await File.findOne({
      _id:      params.id,
      owner_id: userId,
    }).lean();

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // ── 2. Delete from S3 ─────────────────────────────────────────────────
    await s3.send(                      // ← was s3Client which was never imported
      new DeleteObjectCommand({ Bucket: BUCKET, Key: file.storageUrl })
    );

    // ── 3. Delete DB record ────────────────────────────────────────────────
    await File.deleteOne({ _id: params.id });

    return NextResponse.json({ success: true, deleted: file.filename });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[DELETE /api/files/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}