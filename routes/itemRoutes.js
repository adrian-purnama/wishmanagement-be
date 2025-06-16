import express from "express";
import Item from "../schema/ItemSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/all", authMiddleware, async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 }); // sort alphabetically
    const formatted = items.map((item) => ({
      id: item._id,
      name: item.name,
      total_quantity: item.total_quantity,
      total_spent: item.total_spent
    }));
    res.json({ condition: true, items: formatted });
  } catch (err) {
    console.error("Failed to fetch items:", err);
    res.status(500).json({ condition: false, message: "Failed to load items" });
  }
});

export default router;
