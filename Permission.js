import mongoose from 'mongoose';

const PermissionSchema = new mongoose.Schema(
  {
    // The user this resource is shared WITH
    sharedwith: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'sharedwith user is required'],
    },
    permission: {
      type: String,
      enum: ['read', 'write', 'admin'],
      required: [true, 'Permission level is required'],
    },
    // Polymorphic: points to either a File or Folder _id
    resource_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Resource ID is required'],
    },
    resource_type: {
      type: String,
      enum: ['file', 'folder'],
      required: [true, 'Resource type is required'],
    },
  },
  { timestamps: true }
);

// Indexes
PermissionSchema.index({ sharedwith: 1, resource_id: 1 });
PermissionSchema.index({ resource_id: 1, resource_type: 1 });

// Prevent duplicate permission entries for same user + resource
PermissionSchema.index(
  { sharedwith: 1, resource_id: 1, resource_type: 1 },
  { unique: true }
);

export default mongoose.models.Permission || mongoose.model('Permission', PermissionSchema);
