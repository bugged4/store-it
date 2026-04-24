import mongoose, { Schema, Document } from "mongoose";

export interface IFolder extends Document {
  name: string;
  owner_id: string;
  owner_email: string;
  parent_id?: string | null; // for nested folders
  createdAt: Date;
}

const FolderSchema = new Schema<IFolder>(
  {
    name:        { type: String, required: true },
    owner_id:    { type: String, required: true },
    owner_email: { type: String, required: true },
    parent_id:   { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Folder ||
  mongoose.model<IFolder>("Folder", FolderSchema);