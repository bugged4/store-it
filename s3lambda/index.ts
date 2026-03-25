// lambda/src/handler.ts
import { S3Event } from 'aws-lambda';
import mongoose from 'mongoose';
import File from '../models/File';
import User from '../models/User';

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI!);
  isConnected = true;
  console.log('✅ MongoDB connected');
}

export const handler = async (event: S3Event) => {
  try {
    await connectDB();

    for (const record of event.Records) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const actualSize = record.s3.object.size;

      console.log('📦 S3 upload confirmed for key:', key);

      // ✅ Find the pending record by S3 key and mark it active
      const file = await File.findOneAndUpdate(
        { storageUrl: key, status: 'pending' },
        {
          $set: {
            status: 'active',
            size: actualSize,          // use real size from S3 event
          },
        },
        { new: true }
      );

      if (!file) {
        console.warn('⚠️ No pending file found for key:', key);
        continue;
      }

      // ✅ Update user storage quota
      await User.findByIdAndUpdate(file.owner_id, {
        $inc: { storageUsed: actualSize },
      });

      console.log('✅ File confirmed in DB:', file._id);
    }

    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error('🔥 Lambda error:', error);
    throw error;
  }
};