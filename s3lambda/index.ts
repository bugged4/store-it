import { S3Event } from "aws-lambda";
import mongoose from "mongoose";
import File from "../models/File";
import User from "../models/User";

let isConnected = false;

// 🔌 Reuse DB connection (VERY IMPORTANT for Lambda performance)
async function connectDB() {
  if (isConnected) return;

  await mongoose.connect(process.env.MONGO_URI!);
  isConnected = true;
}

export const handler = async (event: S3Event) => {
  try {
    await connectDB();

    for (const record of event.Records) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, " "));

      // ⚠️ Metadata comes from S3
      const metadata = record.s3.object.metadata || {};

      // ⚠️ Keys are lowercase!
      const userId = metadata.userid;
      const filename = metadata.filename;
      const folderId = metadata.folderid || null;
      const size = Number(metadata.size || 0);
      const mimeType = metadata.mimetype;

      if (!userId) {
        console.log("❌ Missing metadata, skipping...");
        continue;
      }

      console.log("📦 Processing file:", key);

      // ✅ Create file entry
      await File.create({
        Filename: filename,
        mimetype: mimeType,
        size: size,
        folders_id: folderId,
        owner_id: userId,
        storageUrl: key,
      });

      // ✅ Update user quota
      await User.findByIdAndUpdate(userId, {
        $inc: { storageUsed: size },
      });

      console.log("✅ File saved to DB");
    }

    return {
      statusCode: 200,
      body: "Success",
    };
  } catch (error) {
    console.error("🔥 Lambda error:", error);
    throw error;
  }
};