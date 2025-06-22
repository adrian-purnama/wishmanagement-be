import express from "express";
import Item from "../schema/ItemSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";
import Purchase from "../schema/PurchaseSchema.js";
import stringSimilarity from "string-similarity";

const router = express.Router();
let resyncInProgress = false;
let resyncTotal = 0;
let resyncProcessed = 0;

const findClosestItem = async (inputName, threshold = 0.8) => {
    if (!inputName || typeof inputName !== "string") {
        console.log("❌ Invalid input name.");
        return null;
    }

    const allItems = await Item.find({}, "name");
    const names = allItems
        .map((i) => i.name)
        .filter((n) => typeof n === "string" && n.trim().length > 0);

    if (names.length === 0) {
        console.log("⚠️ No valid item names to compare.");
        return null;
    }

    const { bestMatch, ratings } = stringSimilarity.findBestMatch(inputName, names);

    // DEBUG: log each similarity rating
    console.log(`\n🔍 Comparing: "${inputName}"`);
    ratings.forEach((r) => {
        console.log(`  ↪ "${inputName}" vs "${r.target}" = ${(r.rating * 100).toFixed(2)}%`);
    });

    console.log(
        `✅ Best match: "${bestMatch.target}" with ${(bestMatch.rating * 100).toFixed(
            2
        )}% similarity`
    );
    console.log(
        bestMatch.rating >= threshold
            ? `🟢 Grouping with "${bestMatch.target}"\n`
            : `🔴 Not similar enough, will create new item\n`
    );

    if (bestMatch.rating >= threshold) {
        return await Item.findOne({ name: bestMatch.target });
    }

    return null;
};

router.get("/all", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const items = await Item.find()
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Item.countDocuments();

    const formatted = items.map((item) => ({
      id: item._id,
      name: item.name,
      total_quantity: item.total_quantity,
      total_spent: item.total_spent,
    }));

    res.json({
      condition: true,
      items: formatted,
      total,
      page,
      hasMore: skip + items.length < total,
    });
  } catch (err) {
    console.error("Failed to fetch paginated items:", err);
    res.status(500).json({ condition: false, message: "Failed to load items" });
  }
});

router.post("/resync-items", authMiddleware, async (req, res) => {
    try {
        if (resyncInProgress) {
            return res
                .status(429)
                .json({ condition: false, message: "Resync already in progress" });
        }

        resyncInProgress = true;
        resyncTotal = 0;
        resyncProcessed = 0;

        const allPurchases = await Purchase.find();
        resyncTotal = allPurchases.reduce((acc, p) => acc + p.items.length, 0);

        // ✅ Send response early
        res.json({ condition: true, message: "Resync started" });

        console.log("🧹 Resync started...");
        await Item.deleteMany({});
        console.log("✅ All items deleted.");

        for (const purchase of allPurchases) {
            for (const item of purchase.items) {
                let matched = await findClosestItem(item.name, 0.8);
                if (!matched) {
                    matched = new Item({
                        name: item.name,
                        total_quantity: 0,
                        total_spent: 0,
                        history: [],
                    });
                    await matched.save();
                }

                matched.total_quantity += item.quantity;
                matched.total_spent += item.total;
                matched.history.push({
                    store: purchase.store,
                    price_per_unit: item.price,
                    quantity: item.quantity,
                    total: item.total,
                });
                await matched.save();
                resyncProcessed += 1;
            }
        }

        resyncInProgress = false;
        console.log("✅ Resync finished");
    } catch (err) {
        console.error("Resync error:", err);
        resyncInProgress = false;
    }
});

router.get("/resync-status", authMiddleware, (req, res) => {
    res.json({
        inProgress: resyncInProgress,
        total: resyncTotal,
        processed: resyncProcessed,
    });
});

export default router;
