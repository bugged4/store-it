import mongoose, { Schema, Document, Model } from 'mongoose';

// 1. Interface
export interface IFileVersion extends Document {
  file_id: mongoose.Types.ObjectId;
  version: number;
  storage_url: string;
  uploadedAt?: Date;
}

// 2. Schema
const FileVersionSchema: Schema<IFileVersion> = new Schema(
  {
    file_id: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: [true, 'File reference is required'],
    },
    version: {
      type: Number,
      required: [true, 'Version number is required'],
      min: 1,
    },
    storage_url: {
      type: String,
      required: [true, 'Storage URL is required'],
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// 3. Indexes
FileVersionSchema.index({ file_id: 1, version: -1 });

// Unique version per file
FileVersionSchema.index(
  { file_id: 1, version: 1 },
  { unique: true }
);

// 4. Model (Next.js safe)
const FileVersion: Model<IFileVersion> =
  mongoose.models.FileVersion ||
  mongoose.model<IFileVersion>('FileVersion', FileVersionSchema);

export default FileVersion;