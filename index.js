import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import authRoutes from './routes/authRoutes.js';
import purchaseRoutes from "./routes/purchaseRoutes.js";
import saleRoutes from "./routes/saleRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

dotenv.config();
const mongodbLink = process.env.MONGODB_CONNECTION_LINK_LEGACY

const app = express();

app.set('trust proxy', 1);
app.use(cors({
    origin: '*',
    credentials: true
}));

// app.use(cors({
    //   origin: [''],
    //   credentials: true
    // }));
    
    app.use(express.json());
    app.use(express.text());
    
    const globalLimiter = rateLimit({
        windowMs: 10 * 1000,
        max: 20,
        message: { message: "Too many requests, slow down!" },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            console.log(`🚨 Rate limit exceeded: ${req.ip}`);
            res.status(429).json({ message: "Too many requests, slow down!" });
        }
    });
    
    app.use(globalLimiter);
    
    // Attach route handlers
    app.use('/auth', authRoutes);
    app.use("/purchase", purchaseRoutes);
    app.use("/sale", saleRoutes);
    app.use("/item", itemRoutes);
    app.use("/dashboard", dashboardRoutes);


app.get('/test', (req, res) => res.send('hehe'));

async function startServer() {
    try {
        await mongoose.connect(mongodbLink, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        //for user ttl
        // console.log('Connected to DB');
        //         await User.collection.createIndex(
        //     { createdAt: 1 },
        //     {
        //         expireAfterSeconds: 1296000,
        //         partialFilterExpression: { isVerified: false }
        //     }
        // );
        // console.log('TTL index for unverified users created');

        app.listen(3000, () => console.log('Server started on port 3000'));
    } catch (err) {
        console.error('DB Connection Error:', err);
        process.exit(1);
    }
}

startServer();
