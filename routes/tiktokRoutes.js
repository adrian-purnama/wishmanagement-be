import express from "express";
import axios from "axios";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();

const {
  TIKTOK_APP_KEY,
  TIKTOK_APP_SECRET,
  TIKTOK_REDIRECT_URI
} = process.env;

// 1. Redirect to TikTok OAuth
router.get("/connect", (req, res) => {
  const state = Date.now(); 
  const url = `https://auth.tiktok-shops.com/oauth/authorize?app_key=${TIKTOK_APP_KEY}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
  res.redirect(url);
});

// 2. Handle TikTok callback
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const response = await axios.post("https://auth.tiktok-shops.com/api/token/create", {
      app_key: TIKTOK_APP_KEY,
      app_secret: TIKTOK_APP_SECRET,
      auth_code: code,
      grant_type: "authorized_code"
    });

    const { access_token, refresh_token, expire_time, seller } = response.data.data;

    // You should save this info in your database
    console.log("✅ TikTok shop connected:", {
      shop_id: seller.seller_id,
      access_token,
      refresh_token,
      expires_at: expire_time
    });

    // Redirect to success page or dashboard
    res.redirect(`/tiktok/success?shop_id=${seller.seller_id}`);
  } catch (err) {
    console.error("❌ Token exchange failed", err.response?.data || err.message);
    res.status(500).send("Failed to connect TikTok Shop");
  }
});

export default router;
