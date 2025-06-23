import mongoose from "mongoose";

const MatchingQueueSchema = new mongoose.Schema({
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Purchase",
    required: true
  },
  totalItems: { type: Number, default: 0 },
  processed: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "processing" , "done", "error"],
    default: "pending"
  }
}, { timestamps: true });

export default mongoose.model("MatchingQueue", MatchingQueueSchema);
