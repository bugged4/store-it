// app/api/folders/[id]/share/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import connectDB from "@/lib/mongoose";
import { authOptions } from "@/lib/[...nextauth]";         // adjust path to your [...nextauth] authOptions export
import { s3, BUCKET } from "@/lib/s3";
import FolderShare from "@/models/Foldershare";
import Folder from "@/models/Folder";
import File from "@/models/File";

// ─────────────────────────────────────────────────────────────────────────────
// Expected Folder model fields:  { name, owner_id, ... }
// Expected File model fields:    { folderId, owner_id, status, storageUrl,
//                                  filename, mimetype, size }
// ─────────────────────────────────────────────────────────────────────────────

const SHARE_TTL_SECONDS  = 7 * 24 * 60 * 60;
const SHARE_TTL_MS       = SHARE_TTL_SECONDS * 1000;
const REUSE_THRESHOLD_MS = 30 * 60 * 1000;

// ── Auth helper ───────────────────────────────────────────────────────────────
// Returns the session userId or throws a 401-shaped error.
async function getUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err: any = new Error("Unauthorised");
    err.status = 401;
    throw err;
  }
  return session.user.id;
}

// ── POST /api/folders/:id/share ───────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
    }

    await connectDB();
    const now = new Date();

    // ── 1. Verify folder ownership ─────────────────────────────────────────
    const folder = await Folder.findOne({
      _id:      params.id,
      owner_id: userId,
    }).lean();

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // ── 2. Return an existing valid share if one exists ────────────────────
    const reuseDeadline = new Date(now.getTime() + REUSE_THRESHOLD_MS);

    const existingShare = await FolderShare.findOne({
      folderId:  params.id,
      owner_id:  userId,
      expiresAt: { $gt: reuseDeadline },
    }).lean();

    if (existingShare) {
      return NextResponse.json({
        shareToken: existingShare.token,
        shareUrl:   buildShareUrl(req, existingShare.token),
        expiresAt:  existingShare.expiresAt,
        fileCount:  existingShare.files?.length ?? 0,
        reused:     true,
      });
    }

    // ── 3. Fetch all uploaded files in the folder ──────────────────────────
    const files = await File.find({
      folderId: params.id,
      owner_id: userId,
      status:   "uploaded",
    }).lean();

    // ── 4. Presign a view URL for every file ───────────────────────────────
    const expiresAt = new Date(now.getTime() + SHARE_TTL_MS);

    const presignedFiles = await Promise.all(
      files.map(async (file) => {
        const command = new GetObjectCommand({
          Bucket: BUCKET,
          Key:    file.storageUrl,
          ResponseContentDisposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
          ResponseContentType: file.mimetype,
        });

        const url = await getSignedUrl(s3, command, {
          expiresIn: SHARE_TTL_SECONDS,
        });

        return {
          fileId:      (file._id as any).toString(),
          filename:    file.filename,
          mimetype:    file.mimetype,
          size:        file.size,
          url,
          downloadUrl: buildDownloadUrl(req, (file._id as any).toString()),
        };
      })
    );

    // ── 5. Mint an opaque share token ──────────────────────────────────────
    const token = randomBytes(32).toString("hex");

    // ── 6. Persist the share manifest ─────────────────────────────────────
    await FolderShare.create({
      token,
      folderId:   params.id,
      folderName: (folder as any).name,
      owner_id:   userId,
      files:      presignedFiles,
      expiresAt,
    });

    return NextResponse.json({
      shareToken: token,
      shareUrl:   buildShareUrl(req, token),
      expiresAt,
      fileCount:  presignedFiles.length,
      reused:     false,
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[POST /api/folders/:id/share]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET /api/folders/:id/share ────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
    }

    await connectDB();

    const share = await FolderShare.findOne(
      {
        folderId:  params.id,
        owner_id:  userId,
        expiresAt: { $gt: new Date() },
      },
      null,
      { sort: { createdAt: -1 } }
    ).lean();

    if (!share) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active:     true,
      shareToken: share.token,
      shareUrl:   buildShareUrl(req, share.token),
      expiresAt:  share.expiresAt,
      fileCount:  share.files?.length ?? 0,
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[GET /api/folders/:id/share]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/folders/:id/share ─────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
    }

    await connectDB();

    const result = await FolderShare.deleteMany({
      folderId: params.id,
      owner_id: userId,
    });

    return NextResponse.json({ success: true, revoked: result.deletedCount });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[DELETE /api/folders/:id/share]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildShareUrl(req: NextRequest, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base}/share/folder/${token}`;
}

function buildDownloadUrl(req: NextRequest, fileId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base}/api/files/${fileId}/download`;
}