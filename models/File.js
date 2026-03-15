import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: [true, 'Filename is required'],
      trim: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
    },
    size: {
      type: Number,
      required: [true, 'File size is required'],
      min: 0,
    },
    mimetype: {
      type: String,
      required: [true, 'MIME type is required'],
    },
    storageurl: {
      type: String,
      required: [true, 'Storage URL is required'],
    },
    folders_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      required: [true, 'Folder is required'],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Indexes
FileSchema.index({ owner_id: 1, isDeleted: 1 });
FileSchema.index({ folders_id: 1, isDeleted: 1 });
FileSchema.index({ owner_id: 1, filename: 1 });

// Auto-update updatedAt on save
FileSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

FileSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

export default mongoose.models.File || mongoose.model('File', FileSchema);
