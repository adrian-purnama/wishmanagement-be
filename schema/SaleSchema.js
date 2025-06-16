import mongoose from "mongoose";

const SaleSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  channel: { type: String, default: "Shopee" }, 
  note: String 
}, { timestamps: true });

export default mongoose.model("Sale", SaleSchema);
