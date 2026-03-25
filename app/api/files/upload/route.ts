import { authOptions } from '@/lib/[...nextauth]';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerSession } from 'next-auth';
import User from '@/models/User';
import connectDB from '@/lib/mongoose';
import File from "@/models/File"
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
});

// app/api/files/upload/route.ts
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, mimeType, size, folderId } = await req.json();

  await connectDB();

  const user = await User.findById(session.user.id);
  if (user.storageUsed + size > user.storageLimit) {
    return Response.json({ error: 'Storage quota exceeded' }, { status: 413 });
  }

  const key = `${session.user.id}/${Date.now()}-${filename}`;

  // ✅ Write to MongoDB immediately as "pending"
  await File.create({
    filename,
    mimetype: mimeType,
    size,
    folders_id: folderId || null,
    owner_id: session.user.id,
    storageUrl: key,
    status: 'pending',           // 👈 not confirmed yet
  });

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: mimeType,
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return Response.json({ uploadUrl: presignedUrl, key });
}