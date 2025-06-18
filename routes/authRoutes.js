import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../schema/UserSchema.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const jwtSecretKey = process.env.JWT_SECRET_KEY;

// 🟢 Register
// router.post('/register', async (req, res) => {
//   try {
//     console.log("register")
//     const { username, email, password } = req.body;

//     if (!email || !password || !username) {
//       return res.status(400).json({ message: "Missing fields", condition: false });
//     }

//     const userExists = await User.findOne({ email });
//     if (userExists) {
//       return res.status(409).json({ message: "Email already registered", condition: false });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);
//     const newUser = await User.create({
//       username,
//       email,
//       password: hashedPassword,
//     });

//     const token = jwt.sign({ userId: newUser._id }, jwtSecretKey, { expiresIn: '7d' });

//     res.json({
//       message: "User registered successfully",
//       token,
//       username: newUser.username,
//       condition: true
//     });
//   } catch (err) {
//     console.error("Register error:", err.message);
//     res.status(500).json({ message: "Registration failed", condition: false });
//   }
// });

// 🟢 Login
router.post('/login', async (req, res) => {
  try {
    console.log("login")
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "User not found", condition: false });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid password", condition: false });
    }

    const token = jwt.sign({ userId: user._id }, jwtSecretKey, { expiresIn: '7d' });

    res.json({
      message: "Login successful",
      token,
      username: user.username,
      condition: true
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Login failed", condition: false });
  }
});

// 🟢 Check Auth (auto login)
router.post('/check-auth', async (req, res) => {
  try {
    console.log("check-auth")
    const token = req.body.token;

    if (!token) return res.status(401).json({ message: "Token required", condition: false });

    const decoded = jwt.verify(token, jwtSecretKey);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "Invalid token", condition: false });
    }

    res.json({
      condition: true,
      username: user.username
    });
  } catch (err) {
    console.error("Check-auth error:", err.message);
    res.status(401).json({ message: "Invalid or expired token", condition: false });
  }
});

export default router;
