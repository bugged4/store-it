import mongoose from 'mongoose';

const FileVersionSchema = new mongoose.Schema(
  {
    file_id: {
      type: mongoose.Schema.Types.ObjectId,
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

// Indexes
FileVersionSchema.index({ file_id: 1, version: -1 });

// Ensure unique version numbers per file
FileVersionSchema.index({ file_id: 1, version: 1 }, { unique: true });

export default mongoose.models.FileVersion ||
  mongoose.model('FileVersion', FileVersionSchema);
