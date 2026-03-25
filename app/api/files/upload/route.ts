// app/api/files/upload/route.ts

import { authOptions } from '@/lib/[...nextauth]';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerSession } from 'next-auth';
import User from "@/models/User";
import connectDB from "@/lib/mongoose";
export async function POST(req: Request) {
  
const session= await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { filename, mimeType, size, folderId } = await req.json();

  await connectDB();

  // ✅ Check quota BEFORE upload
  const user = await User.findById(session.user.id);

  if (user.storageUsed + size > user.storageLimit) {
    return Response.json({ error: 'Storage quota exceeded' }, { status: 413 });
  }

  const key = `${session.user.id}/${Date.now()}-${filename}`;

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY!,
      secretAccessKey: process.env.AWS_SECRET_KEY!
    }
  });

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: mimeType,
    ContentLength: size,

    // 🔥 IMPORTANT: pass metadata to Lambda
    Metadata: {
      userId: session.user.id,
      filename: filename,
      folderId: folderId || "",
      size: size.toString(),
      mimeType: mimeType
    }
  });

  const presignedUrl = await getSignedUrl(s3, command, {
    expiresIn: 300
  });

  return Response.json({
    uploadUrl: presignedUrl,
    key // 🔥 send this for debugging if needed
  });
}