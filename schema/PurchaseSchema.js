import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  store: {type : String},
  items: [
    {
      item_id: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
      name: String, 
      price: Number,
      quantity: Number,
      total: Number,
    },
  ],
  admin_fee: { type: Number, default: 0 },
  shipping_fee: { type: Number, default: 0 },
  total: Number,
}, { timestamps: true });

export default mongoose.model("Purchase", PurchaseSchema);
