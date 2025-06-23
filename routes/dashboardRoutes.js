import express from "express";
import Purchase from "../schema/PurchaseSchema.js";
import Sale from "../schema/SaleSchema.js";
import Item from "../schema/ItemSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


const getDateRange = (range) => {
    const now = new Date();
    let start;
    switch (range) {
        case "7d":
        case "7":
            start = new Date(now.setDate(now.getDate() - 7));
            break;
        case "30d":
        case "30":
            start = new Date(now.setDate(now.getDate() - 30));
            break;
        case "3m":
        case "90":
            start = new Date(now.setMonth(now.getMonth() - 3));
            break;
        case "12m":
        case "365":
            start = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        case "3y":
        case "1095":
            start = new Date(now.setFullYear(now.getFullYear() - 3));
            break;
        default:
            // fallback to 7 days if unknown
            start = new Date(now.setDate(now.getDate() - 7));
    }
    return start;
};

router.get("/", authMiddleware, async (req, res) => {
    try {
        const range = req.query.range || "30d";
        const startDate = getDateRange(range);

        const rangePurchases = startDate
            ? await Purchase.find({ date: { $gte: startDate } })
            : await Purchase.find();

        const rangeSales = startDate
            ? await Sale.find({ date: { $gte: startDate } })
            : await Sale.find();
        const purchaseResult = await Purchase.aggregate([
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: "$total" },
                    totalAdminFee: { $sum: "$admin_fee" },
                    totalShippingFee: { $sum: "$shipping_fee" },
                },
            },
        ]);

        const saleResult = await Sale.aggregate([
            {
                $group: {
                    _id: null,
                    totalGained: { $sum: "$amount" },
                },
            },
        ]);

        const itemResult = await Item.aggregate([
            {
                $facet: {
                    totalItemsBought: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: "$total_quantity" },
                            },
                        },
                    ],
                    topItem: [
                        { $sort: { total_quantity: -1 } },
                        { $limit: 1 },
                        {
                            $project: {
                                _id: 0,
                                name: 1,
                                quantity: "$total_quantity",
                            },
                        },
                    ],
                },
            },
        ]);

        const totalSpent = purchaseResult[0]?.totalSpent || 0;
        const totalAdminFee = purchaseResult[0]?.totalAdminFee || 0;
        const totalShippingFee = purchaseResult[0]?.totalShippingFee || 0;

        const totalGained = saleResult[0]?.totalGained || 0;
        const netGain = totalGained - totalSpent;
        const totalSalesCount = await Sale.countDocuments();

        const totalItemsBought = itemResult[0]?.totalItemsBought[0]?.total || 0;
        const topItem = itemResult[0]?.topItem[0] || { name: "-", quantity: 0 };

        //======================================================

        const now = new Date();

        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1); // June 1
        const thisMonthEnd = new Date(); // Now

        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // May 1
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1); // June 1

        const [thisMonthPurchase, lastMonthPurchase] = await Promise.all([
            Purchase.aggregate([
                { $match: { date: { $gte: thisMonthStart, $lt: thisMonthEnd } } },
                {
                    $group: {
                        _id: null,
                        totalSpent: { $sum: "$total" },
                    },
                },
            ]),
            Purchase.aggregate([
                { $match: { date: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
                {
                    $group: {
                        _id: null,
                        totalSpent: { $sum: "$total" },
                    },
                },
            ]),
        ]);

        const [thisMonthSale, lastMonthSale] = await Promise.all([
            Sale.aggregate([
                { $match: { date: { $gte: thisMonthStart, $lt: thisMonthEnd } } },
                {
                    $group: {
                        _id: null,
                        totalGained: { $sum: "$amount" },
                    },
                },
            ]),
            Sale.aggregate([
                { $match: { date: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
                {
                    $group: {
                        _id: null,
                        totalGained: { $sum: "$amount" },
                    },
                },
            ]),
        ]);

        const thisSpent = thisMonthPurchase[0]?.totalSpent || 0;
        const lastSpent = lastMonthPurchase[0]?.totalSpent || 0;

        const thisGained = thisMonthSale[0]?.totalGained || 0;
        const lastGained = lastMonthSale[0]?.totalGained || 0;

        const thisNet = thisGained - thisSpent;
        const lastNet = lastGained - lastSpent;

        const comparison = {
            this_month: {
                spent: thisSpent,
                gained: thisGained,
                net_gain: thisNet,
            },
            last_month: {
                spent: lastSpent,
                gained: lastGained,
                net_gain: lastNet,
            },
        };

        //===========================================

        const trends = {};

        for (const p of rangePurchases) {
            const dateKey = new Date(p.date).toISOString().split("T")[0];
            trends[dateKey] = trends[dateKey] || { spent: 0, gained: 0, items: 0 };
            trends[dateKey].spent += p.total || 0;
            trends[dateKey].items += (p.items || []).reduce((acc, i) => acc + (i.quantity || 0), 0);
        }

        for (const s of rangeSales) {
            const dateKey = new Date(s.date).toISOString().split("T")[0];
            trends[dateKey] = trends[dateKey] || { spent: 0, gained: 0, items: 0 };
            trends[dateKey].gained += s.amount || 0;
        }

        const trendArray = Object.entries(trends)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .map(([date, values]) => ({ date, ...values }));

        res.json({
            condition: true,
            stats: {
                totals: {
                    spent: totalSpent,
                    gained: totalGained,
                    net_gain: netGain,
                    admin_fee: totalAdminFee,
                    shipping_fee: totalShippingFee,
                    sales_count: totalSalesCount,
                    items_bought: totalItemsBought,
                },
                trends: {
                    range,
                    data: trendArray,
                },
                top_item: topItem,
                comparison,
            },
        });
    } catch (err) {
        console.error("📊 Dashboard error:", err);
        res.status(500).json({ condition: false, message: "Dashboard load failed" });
    }
});

router.post("/ask-ai", authMiddleware, async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
            return res.status(400).json({ message: "Invalid prompt" });
        }

        // Load relevant data
        const [purchases, sales, items] = await Promise.all([
            Purchase.find().sort({ date: -1 }).limit(100).lean(),
            Sale.find().sort({ date: -1 }).limit(100).lean(),
            Item.find().sort({ createdAt: -1 }).limit(100).lean(),
        ]);

        const data = {
            summary: {
                purchase_count: purchases.length,
                sale_count: sales.length,
                item_count: items.length,
            },
            purchases,
            sales,
            items,
        };

        const fullPrompt = `
You are a business analysis assistant. The user will give you a question. 
Use the following business data to answer with clarity and insight.

User question: ${prompt}

Business data (JSON):
${JSON.stringify(data, null, 2)}

Please respond with helpful advice, trends, summaries, or clear metrics in readable text.
        `;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(fullPrompt);

        const responseText = result.response.text();
        return res.json({ answer: responseText.trim() });
    } catch (err) {
        console.error("❌ AI Ask Error:", err);
        return res.status(500).json({ message: "AI processing failed" });
    }
});


export default router;
