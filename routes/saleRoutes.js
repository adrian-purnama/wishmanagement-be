import express from "express";
import Sale from "../schema/SaleSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// 📝 Manual Sale Entry
router.post("/manual", authMiddleware, async (req, res) => {
  try {
    const { amount, channel = "Shopee", note = "", date } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ condition: false, message: "Amount is required and must be a number." });
    }

    const newSale = new Sale({
      amount: Number(amount),
      channel,
      note,
      date: date ? new Date(date) : new Date()
    });

    await newSale.save();
    res.json({ condition: true, message: "Sale saved", sale: newSale });
  } catch (err) {
    console.error("Manual sale save error:", err);
    res.status(500).json({ condition: false, message: "Server error" });
  }
});

// 📦 Get all sales
router.get("/all", authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [sales, total] = await Promise.all([
            Sale.find().sort({ date: -1 }).skip(skip).limit(limit),
            Sale.countDocuments()
        ]);

        res.json({ condition: true, sales, total });
    } catch (err) {
        console.error("Failed to fetch sales:", err);
        res.status(500).json({ condition: false, message: "Failed to load sales" });
    }
});


// 📝 Update a sale
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ condition: true, updated });
  } catch (err) {
    res.status(500).json({ condition: false, message: "Failed to update sale" });
  }
});

// ❌ Delete a sale
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ condition: true, message: "Sale deleted" });
  } catch (err) {
    res.status(500).json({ condition: false, message: "Failed to delete sale" });
  }
});


export default router;
