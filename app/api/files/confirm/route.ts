import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import File from "@/models/File";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { fileId } = body as { fileId: string };

  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  await connectDB();

  const file = await File.findById(fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Prevent double-counting if confirm is called more than once
  if (file.status === "uploaded") {
    return NextResponse.json({ file }, { status: 200 });
  }

  file.status = "uploaded";
  await file.save();

  // Increment user's storage usage
  await User.findByIdAndUpdate(file.owner_id, { $inc: { storageused: file.size } });

  return NextResponse.json({ file }, { status: 200 });
}