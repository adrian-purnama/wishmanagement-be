import mongoose from "mongoose";
import dotenv from "dotenv";
import MatchingQueue from "../schema/MatchingQueueSchema.js";
import Purchase from "../schema/PurchaseSchema.js";
import Item from "../schema/ItemSchema.js";
import stringSimilarity from "string-similarity";

dotenv.config();
mongoose.connect(process.env.MONGODB_CONNECTION_LINK_LEGACY);

// Reuse your fuzzy matching
const findClosestItem = async (inputName, threshold = 0.8) => {
  const allItems = await Item.find({}, "name");
  const names = allItems.map(i => i.name);
  const { bestMatch } = stringSimilarity.findBestMatch(inputName, names);
  return bestMatch.rating >= threshold
    ? await Item.findOne({ name: bestMatch.target })
    : null;
};

const processQueue = async () => {
  const job = await MatchingQueue.findOne({ status: "pending" });
  if (!job) return;

  console.log(`🔧 Processing purchase ${job.purchaseId}...`);

  const purchase = await Purchase.findById(job.purchaseId);
  if (!purchase) return;

  try {
    for (let i = 0; i < purchase.items.length; i++) {
      const item = purchase.items[i];
      const matched = await findClosestItem(item.name);

      if (!matched) {
        const newItem = new Item({ name: item.name, total_quantity: 0, total_spent: 0, history: [] });
        await newItem.save();
        item.item_id = newItem._id;
      } else {
        matched.total_quantity += item.quantity;
        matched.total_spent += item.total;
        matched.history.push({
          store: purchase.store,
          price_per_unit: item.price,
          quantity: item.quantity,
          total: item.total
        });
        await matched.save();
        item.item_id = matched._id;
        item.name = matched.name; // normalize
      }

      job.processed = i + 1;
      await job.save();
    }

    job.status = "done";
    await job.save();
    console.log(`✅ Finished purchase ${job.purchaseId}`);
  } catch (err) {
    console.error("❌ Worker error:", err);
    job.status = "error";
    await job.save();
  }
};

setInterval(processQueue, 3000); // Run every 3 seconds
