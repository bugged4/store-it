import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import File from "@/models/File";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { fileId, folderId } = await req.json();

    await File.findByIdAndUpdate(fileId, {
      folders_id: folderId || null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to move file" }, { status: 500 });
  }
}