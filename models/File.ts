import mongoose from "mongoose";
const Schema = mongoose.Schema;

// models/File.ts
const FileSchema = new Schema({
  filename:   { type: String, required: true },
  mimetype:   { type: String },
  size:       { type: Number },
  folders_id: { type: Schema.Types.ObjectId, default: null },
  owner_id:   { type: Schema.Types.ObjectId, required: true },
  storageUrl: { type: String, required: true },           // the S3 key
  status:     { type: String, enum: ['pending', 'uploaded'], default: 'pending' },
}, { timestamps: true });

export default mongoose.models.File|| mongoose.model('File', FileSchema);