import mongoose from 'mongoose';

const FolderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
    },
    // null means root-level folder
    parentfolder_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Indexes
FolderSchema.index({ owner_id: 1, parentfolder_id: 1 });
FolderSchema.index({ owner_id: 1, name: 1 });

// Prevent duplicate folder names in the same parent for the same owner
FolderSchema.index(
  { owner_id: 1, parentfolder_id: 1, name: 1 },
  { unique: true }
);

export default mongoose.models.Folder || mongoose.model('Folder', FolderSchema);
