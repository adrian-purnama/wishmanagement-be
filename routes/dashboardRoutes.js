import express from "express";
import Purchase from "../schema/PurchaseSchema.js";
import Sale from "../schema/SaleSchema.js";
import Item from "../schema/ItemSchema.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

const getDateRange = (range) => {
  const now = new Date();
  let start;
  switch (range) {
    case "7d": start = new Date(now.setDate(now.getDate() - 7)); break;
    case "30d": start = new Date(now.setDate(now.getDate() - 30)); break;
    case "3m": start = new Date(now.setMonth(now.getMonth() - 3)); break;
    case "12m": start = new Date(now.setFullYear(now.getFullYear() - 1)); break;
    case "3y": start = new Date(now.setFullYear(now.getFullYear() - 3)); break;
    default: start = null;
  }
  return start;
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    const range = req.query.range || "30d";
    const startDate = getDateRange(range);

    const [allPurchases, allSales, allItems] = await Promise.all([
      Purchase.find(),
      Sale.find(),
      Item.find()
    ]);

    const sum = (arr, key) => arr.reduce((acc, x) => acc + (x[key] || 0), 0);
    const flatItems = (arr) => arr.flatMap(p => p.items || []);

    // 🧮 Use Item model for quantity and top item
    const totalItems = allItems.reduce((sum, item) => sum + (item.total_quantity || 0), 0);
    const topItem = allItems.sort((a, b) => (b.total_quantity || 0) - (a.total_quantity || 0))[0];

    // 📅 Monthly windows
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonthPurchases = allPurchases.filter(p => new Date(p.date) >= thisMonthStart);
    const lastMonthPurchases = allPurchases.filter(p => {
      const d = new Date(p.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    const thisMonthSales = allSales.filter(s => new Date(s.date) >= thisMonthStart);
    const lastMonthSales = allSales.filter(s => {
      const d = new Date(s.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    // 📊 Monthly comparison (items still from purchases)
    const getQuantity = (arr) => flatItems(arr).reduce((acc, i) => acc + i.quantity, 0);
    const compareBlock = {
      this_month: {
        spent: sum(thisMonthPurchases, "total"),
        gained: sum(thisMonthSales, "amount"),
        items: getQuantity(thisMonthPurchases),
      },
      last_month: {
        spent: sum(lastMonthPurchases, "total"),
        gained: sum(lastMonthSales, "amount"),
        items: getQuantity(lastMonthPurchases),
      },
    };

    // 📈 Range-based trends
    const rangePurchases = startDate
      ? allPurchases.filter(p => new Date(p.date) >= startDate)
      : allPurchases;
    const rangeSales = startDate
      ? allSales.filter(s => new Date(s.date) >= startDate)
      : allSales;

    const trends = {};
    for (const p of rangePurchases) {
      const dateKey = new Date(p.date).toISOString().split("T")[0];
      if (!trends[dateKey]) trends[dateKey] = { spent: 0, items: 0, gained: 0 };
      trends[dateKey].spent += p.total;
      trends[dateKey].items += p.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
    }

    for (const s of rangeSales) {
      const dateKey = new Date(s.date).toISOString().split("T")[0];
      if (!trends[dateKey]) trends[dateKey] = { spent: 0, items: 0, gained: 0 };
      trends[dateKey].gained += s.amount || 0;
    }

    const trendArray = Object.entries(trends)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([date, values]) => ({ date, ...values }));

    // 🧾 Totals
    const totalSpent = sum(allPurchases, "total");
    const totalSalesCount = allSales.length;
    const totalSalesIDR = sum(allSales, "amount");
    const totalShippingFee = sum(allPurchases, "shipping_fee");
    const totalAdminFee = sum(allPurchases, "admin_fee");

    res.json({
      condition: true,
      stats: {
        total_spent: totalSpent,
        total_sales_count: totalSalesCount,
        total_sales_value: totalSalesIDR,
        total_net: totalSpent - totalSalesIDR,
        total_items_bought: totalItems,
        fees: {
          shipping: totalShippingFee,
          admin: totalAdminFee,
        },
        top_item: {
          name: topItem?.name || "-",
          quantity: topItem?.total_quantity || 0,
        },
        trends: {
          range,
          data: trendArray,
        },
        comparisons: compareBlock,
      },
    });
  } catch (err) {
    console.error("📊 Dashboard error:", err);
    res.status(500).json({ condition: false, message: "Dashboard load failed" });
  }
});

export default router;
