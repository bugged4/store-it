import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import { s3, BUCKET } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import File from "@/models/File";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { key } = body as { key: string };

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  await connectDB();

  // Ownership check — users can only get URLs to their own files
  const user = await User.findOne({ email: session.user.email });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const file = await File.findOne({ storageUrl: key, owner_id: user._id });
  if (!file) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 } // 1 hour
  );

  return NextResponse.json({ url }, { status: 200 });
}