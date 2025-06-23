import express from "express";
import Purchase from "../schema/PurchaseSchema.js";
import Item from "../schema/ItemSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";
import stringSimilarity from "string-similarity";
import MatchingQueue from "../schema/MatchingQueueSchema.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mongoose from "mongoose";


dotenv.config();
const router = express.Router();
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, "uploads/"),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // Keep size limit per file (10MB recommended)
    },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

// 📝 Manual entry
router.post("/manual", authMiddleware, async (req, res) => {
    try {
        const { store, items } = req.body;
        const admin_fee = Number(req.body.admin_fee || 0);
        const shipping_fee = Number(req.body.shipping_fee || 0);

        if (!store || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ condition: false, message: "Invalid input" });
        }

        let purchaseItems = [];
        let totalPurchase = 0;

        for (const item of items) {
            const { name, price, quantity } = item;
            const total = price * quantity;
            totalPurchase += total;

            // Step 1: Try fuzzy match
            let matchedItem = await findClosestItem(name, 0.8);

            // Step 2: If not found, double-check exact match in DB
            if (!matchedItem) {
                matchedItem = await Item.findOne({ name: name.trim() });
            }

            // Step 3: Create if still not found
            if (!matchedItem) {
                matchedItem = new Item({
                    name: name.trim(),
                    total_quantity: 0,
                    total_spent: 0,
                    history: [],
                });
            }

            // Step 5: Add to purchase
            purchaseItems.push({
                item_id: matchedItem._id,
                name: matchedItem.name,
                price,
                quantity,
                total,
            });
        }

        const fullTotal = totalPurchase + admin_fee + shipping_fee;

        const newPurchase = new Purchase({
            store,
            items: purchaseItems,
            admin_fee,
            shipping_fee,
            total: fullTotal,
        });

        await newPurchase.save();

        await MatchingQueue.create({
            purchaseId: newPurchase._id,
            totalItems: items.length,
            processed: 0,
            status: "pending",
        });

        res.json({ condition: true, message: "Purchase saved", purchase_id: newPurchase._id });
    } catch (err) {
        console.error("Manual save error:", err);
        res.status(500).json({ condition: false, message: "Server error" });
    }
});

router.get("/all", authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [purchases, total] = await Promise.all([
            Purchase.find().sort({ date: -1 }).skip(skip).limit(limit),
            Purchase.countDocuments(),
        ]);

        res.json({ condition: true, purchases, total });
    } catch (err) {
        console.error("Failed to fetch purchases:", err);
        res.status(500).json({ condition: false, message: "Failed to load" });
    }
});

// 📝 Update a purchase
router.put("/:id", authMiddleware, async (req, res) => {
    try {
        const { store, items } = req.body;
        const admin_fee = Number(req.body.admin_fee || 0);
        const shipping_fee = Number(req.body.shipping_fee || 0);

        if (!store || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ condition: false, message: "Invalid input" });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ condition: false, message: "Invalid purchase ID" });
        }
        // if (!status || status.status !== "done") {
        //     return res.status(400).json({
        //         condition: false,
        //         message: "Cannot edit until matching is finished",
        //     });
        // }
        // console.log(status)

        // 1. Find original purchase
        const original = await Purchase.findById(req.params.id);
        if (!original) {
            return res.status(404).json({ condition: false, message: "Purchase not found" });
        }

        // 2. Rollback item impacts from original purchase
        for (const oldItem of original.items) {
            const itemDoc = await Item.findById(oldItem.item_id);
            if (itemDoc) {
                itemDoc.total_quantity -= oldItem.quantity;
                itemDoc.total_spent -= oldItem.total;

                itemDoc.history = itemDoc.history.filter(
                    (h) =>
                        h.store !== original.store ||
                        h.price_per_unit !== oldItem.price ||
                        h.quantity !== oldItem.quantity
                );

                await itemDoc.save();
            }
        }

        // 3. Apply new changes with fuzzy matching
        const purchaseItems = [];
        let totalPurchase = 0;

        for (const item of items) {
            const { name, price, quantity } = item;
            const total = price * quantity;
            totalPurchase += total;

            let matchedItem = await findClosestItem(name, 0.8);
            if (!matchedItem) {
                matchedItem = new Item({ name, total_quantity: 0, total_spent: 0, history: [] });
                await matchedItem.save();
            }

            purchaseItems.push({
                item_id: matchedItem._id,
                name: matchedItem.name,
                price,
                quantity,
                total,
            });
        }

        const fullTotal = totalPurchase + admin_fee + shipping_fee;

        // 4. Update the purchase
        const updatedPurchase = await Purchase.findByIdAndUpdate(
            req.params.id,
            {
                store,
                items: purchaseItems,
                admin_fee,
                shipping_fee,
                total: fullTotal,
            },
            { new: true }
        );

        // 5. Reset matching progress (if using in-memory queue)
        await MatchingQueue.findOneAndUpdate(
            { purchaseId: updatedPurchase._id },
            {
                purchaseId: updatedPurchase._id,
                totalItems: items.length,
                processed: 0,
                status: "pending",
            },
            { upsert: true, new: true }
        );

        res.json({ condition: true, message: "Purchase updated", updated: updatedPurchase });
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ condition: false, message: "Failed to update purchase" });
    }
});

// ❌ Delete a purchase
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        await Purchase.findByIdAndDelete(req.params.id);
        res.json({ condition: true, message: "Purchase deleted" });
    } catch (err) {
        res.status(500).json({ condition: false, message: "Failed to delete purchase" });
    }
});

//logic ini coba pikirin lagi
router.get("/matching-status/:id", authMiddleware, async (req, res) => {
    const status = await MatchingQueue.findOne({ purchaseId: req.params.id });
    if (!status) return res.json({ done: true });
    res.json({
        done: status.status === "done",
        total: status.totalItems,
        processed: status.processed,
    });
});

// 🧾 Upload receipt endpoint
router.post("/upload-receipt", upload.array("receipts"), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ condition: false, message: "No files uploaded" });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
You will receive a scanned or digital receipt in PDF format. Your task is to extract structured data from the document and return it in strict JSON format.

Schema:
{
  "items": [{ "name": string, "quantity": number, "price_per_unit": number, "total": number }],
  "shipping_fee": number,
  "admin_fee": number,
  "store": string
}

Guidelines:
- Return valid JSON only.
- Use 0 or null when unsure.
- Assume currency is IDR.
- Store name is found in the top right of the first page in "Nama Penjual"
`;

        const results = [];

        for (const file of files) {
            try {
                if (!file.path) continue;

                const fileBuffer = fs.readFileSync(file.path);
                const base64Data = fileBuffer.toString("base64");
                const mimeType = file.mimetype;

                const result = await model.generateContent([
                    {
                        inlineData: {
                            mimeType,
                            data: base64Data,
                        },
                    },
                    prompt,
                ]);

                let output = result.response.text();
                fs.unlinkSync(file.path); // Clean up uploaded file

                output = output
                    .replace(/```(?:json)?/gi, "")
                    .replace(/```/g, "")
                    .trim();

                try {
                    const parsed = JSON.parse(output);
                    results.push(parsed);
                } catch (err) {
                    results.push({ error: true, raw: output });
                }
            } catch (fileErr) {
                console.error("❌ File processing error:", fileErr);
                results.push({ error: true, message: "Error reading or processing file" });
            }
        }

        return res.json({
            condition: true,
            results,
        });
    } catch (err) {
        console.error("🛑 Receipt upload error:", err);
        return res.status(500).json({ condition: false, message: "Upload failed" });
    }
});

export default router;
