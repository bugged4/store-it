// app/api/folders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import connectMongoose from "@/lib/mongoose";
import { authOptions } from "@/lib/[...nextauth]";
import { s3, BUCKET } from "@/lib/s3";
import Folder from "@/models/Folder";
import File from "@/models/File";

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err: any = new Error("Unauthorised");
    err.status = 401;
    throw err;
  }
  return session.user.id;
}

// ── DELETE /api/folders/:id ───────────────────────────────────────────────────
// Query param: ?deleteFiles=true  → permanently delete every file inside the folder
//              (omit / false)     → move contained files to root (folderId = null)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
    }

    await connectMongoose();
    const deleteFiles = req.nextUrl.searchParams.get("deleteFiles") === "true";

    // ── 1. Verify ownership ────────────────────────────────────────────────
    const folder = await Folder.findOne({
      _id:      params.id,
      owner_id: userId,
    }).lean();

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // ── 2. Handle contained files ──────────────────────────────────────────
    const containedFiles = await File.find({
      folderId: params.id,
      owner_id: userId,
      status:   "uploaded",
    }).lean();

    if (deleteFiles && containedFiles.length > 0) {
      // a) Delete from S3 in one batched call (max 1000 per request)
      const s3Keys = containedFiles.map((f) => ({ Key: f.storageUrl }));

      for (let i = 0; i < s3Keys.length; i += 1000) {
        await s3.send(                        // ← was s3Client
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: s3Keys.slice(i, i + 1000), Quiet: true },
          })
        );
      }

      // b) Delete DB records
      await File.deleteMany({ folderId: params.id, owner_id: userId });
    } else {
      // Move files to root so they are not orphaned
      await File.updateMany(
        { folderId: params.id, owner_id: userId },
        { $set: { folderId: null } }
      );
    }

    // ── 3. Delete the folder record ────────────────────────────────────────
    await Folder.deleteOne({ _id: params.id });

    return NextResponse.json({
      success:      true,
      deletedFiles: deleteFiles ? containedFiles.length : 0,
      movedToRoot:  deleteFiles ? 0 : containedFiles.length,
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[DELETE /api/folders/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}