// app/api/files/[id]/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import connectMongoose from "@/lib/mongoose";
import { authOptions } from "@/lib/[...nextauth]";          // ← fixed path
import { s3, BUCKET } from "@/lib/s3";
import File from "@/models/File";

const DOWNLOAD_URL_TTL = 60; // seconds — short-lived, browser fetches immediately

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

// ── GET /api/files/:id/download ───────────────────────────────────────────────
// Returns a 302 redirect to a presigned S3 URL that forces the browser to
// download the file rather than opening it inline.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();   // ← was broken `await (req)` call

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
    }

    await connectMongoose();

    // ── 1. Fetch file record ───────────────────────────────────────────────
    const file = await File.findOne({   // ← replaced db.collection("files")
      _id:      params.id,
      owner_id: userId,
      status:   "uploaded",
    }).lean();

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // ── 2. Generate presigned download URL ────────────────────────────────
    //    ResponseContentDisposition forces download instead of inline preview.
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key:    file.storageUrl,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.filename)}"`,
      ResponseContentType: file.mimetype,
    });

    const signedUrl = await getSignedUrl(s3, command, {   // ← was s3Client
      expiresIn: DOWNLOAD_URL_TTL,
    });

    // ── 3. Redirect — browser follows immediately and starts the download ──
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    console.error("[GET /api/files/:id/download]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}