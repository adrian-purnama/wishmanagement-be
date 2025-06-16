import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  total_quantity: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0 },
  history: [
    {
      date: { type: Date, default: Date.now },
      store: String,
      price_per_unit: Number,
      quantity: Number,
      total: Number,
    },
  ],
}, { timestamps: true });

export default mongoose.model("Item", ItemSchema);
