import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/[...nextauth]"
import File from "@/models/File"
import Permission from "@/models/Permission"

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!
  }
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {

  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const file = await File.findById(params.id)

  if (!file) {
    return Response.json({ error: "file not found" }, { status: 404 })
  }

  const canAccess =
    file.owner_id.equals(session.user.id) ||
    await Permission.exists({
      resourceId: file._id,
      resourceType: "file",
      sharedWith: session.user.id
    })

  if (!canAccess)
    return Response.json({ error: "Forbidden" }, { status: 403 })

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: file.storageUrl
    }),
    { expiresIn: 60 }
  )

  return Response.json({ url })
}