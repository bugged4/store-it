import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/[...nextauth]";
import connectDB from "@/lib/mongoose";
import File from "@/models/File";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    // ✅ 1. Check session
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ 2. Get file key from frontend
    const { key } = await req.json();

    // ✅ 3. Connect DB
    await connectDB();

    // ✅ 4. Verify ownership (VERY IMPORTANT)
    const file = await File.findOne({
      storageUrl: key,
      owner_id:session.user.id,
    });

    if (!file) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // ✅ 5. Generate signed URL
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: 60, 
    });

    // ✅ 6. Return URL
    return Response.json({ url });

  } catch (error) {
    console.error(error);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}