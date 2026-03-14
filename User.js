import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    storageused: {
      type: Number,
      default: 0, // bytes
    },
    storagelimit: {
      type: Number,
      default: 5 * 1024 * 1024 * 1024, // 5GB in bytes
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Indexes
UserSchema.index({ email: 1 });

// Virtual: storage usage percentage
UserSchema.virtual('storagePercent').get(function () {
  return ((this.storageused / this.storagelimit) * 100).toFixed(2);
});

// Instance method: check if user has enough storage
UserSchema.methods.hasEnoughStorage = function (fileSize) {
  return this.storageused + fileSize <= this.storagelimit;
};

export default mongoose.models.User || mongoose.model('User', UserSchema);
