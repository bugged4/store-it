import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import File from "@/models/File";
import { NextResponse } from "next/server";


export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const files = await File.find({
      owner_email: session.user.email,
      status: "uploaded",
    })
      .sort({ createdAt: -1 })
      .lean();

    // ── NEW: return grouped structure if ?grouped=true ──────────────
    

    return NextResponse.json(files);

  } catch (error) {
    console.error("Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}