import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;
  storageused: number;
  storagelimit: number;
  createdAt: Date;
  storagePercent: number;
  hasEnoughStorage(fileSize: number): boolean;
}

const UserSchema = new Schema<IUser>(
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
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    storageused: {
      type: Number,
      default: 0,
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

// Index
UserSchema.index({ email: 1 });

// Virtual: storage usage percentage
UserSchema.virtual('storagePercent').get(function () {
  return ((this.storageused / this.storagelimit) * 100).toFixed(2);
});

// Instance method: check if user has enough storage
UserSchema.methods.hasEnoughStorage = function (fileSize: number): boolean {
  return this.storageused + fileSize <= this.storagelimit;
};

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
