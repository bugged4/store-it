import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import { s3, BUCKET } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import File from "@/models/File";
import User from "@/models/User";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { filename, mimeType, size, folderId = null, hash } = body;

    if (!filename || !mimeType || !size || !hash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.hasEnoughStorage(size)) {
      return NextResponse.json(
        { error: "Storage limit exceeded" },
        { status: 413 }
      );
    }

    const existing = await File.findOne({
      hash,
      owner_id: user._id,
      status: "uploaded",
    });

    if (existing) {
      return NextResponse.json(
        { error: "Duplicate file", existingFile: existing },
        { status: 409 }
      );
    }

    const key = `uploads/${user._id}/${Date.now()}-${filename}`;

    const file = await File.create({
      filename,
      hash,
      owner_email: user.email,
      owner_id: user._id,
      mimetype: mimeType,
      size,
      storageUrl: key,
      folders_id: folderId,
      folderId,
      status: "pending",
    });
    console.log({
  region: process.env.AWS_REGION,
  key: process.env.AWS_ACCESS_KEY_ID,
  secret: process.env.AWS_SECRET_ACCESS_KEY,
});

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: mimeType,
        ContentLength: size,
      }),
      { expiresIn: 900 }
    );

    return NextResponse.json({ uploadUrl, fileId: file._id.toString(),key});
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
