const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Shop = require('../models/shop');
const QRCode = require('qrcode');

// global variables
const { JWT_SECRET, BASE_FRONTEND_URL } = require("../config");

// Register shop route
router.post('/register', async (req, res) => {
    const { name, ownerName, email, address, phone, password, bw_cost_per_page, color_cost_per_page } = req.body;
    
    console.log(req.body);

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log("in the try block");

        const newShop = new Shop({
            name,
            ownerName,
            email,
            address,
            phone,
            password: hashedPassword,
            qr_code: null,
            bw_cost_per_page,
            color_cost_per_page,
        });
        await newShop.save();

        // Generate the QR code URL using the shop's ID and BASE_FRONTEND_URL
        const qrData = `intent://${BASE_FRONTEND_URL}/upload?shop_id=${newShop._id}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${BASE_FRONTEND_URL}/upload?shop_id=${newShop._id};end`;
        const qrCodeURL = await QRCode.toDataURL(qrData);

        console.log();

        // Update the shop with the generated QR code URL
        newShop.qr_code = qrCodeURL;
        await newShop.save();

        res.status(201).json(newShop);
    } catch (error) {
        res.status(500).json({ error: 'Failed to register shop' });
    }
});

// Login shop route
router.post('/login', async (req, res) => {
    const { email, password, rememberMe } = req.body;
    try {
        const shop = await Shop.findOne({ email }).select('+password');
        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        const isMatch = await bcrypt.compare(password, shop.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token with longer expiry if remember me is checked
        const token = jwt.sign(
            { shopId: shop._id },
            JWT_SECRET,
            { expiresIn: rememberMe ? '7d' : '24h' }
        );

        const { password: _, ...shopWithoutPassword } = shop.toObject();

        res.status(200).json({
            message: 'Login successful',
            shop: shopWithoutPassword,
            token,
            expiresIn: rememberMe ? '7d' : '24h'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to login' });
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to authenticate token' });
        }
        req.shopId = decoded.shopId;
        next();
    });
};


// Backend/routes/shop.js
router.put('/:shopId/toggle-uploads', verifyToken, async (req, res) => {
    try {
      const { isAcceptingUploads } = req.body;
      const shop = await Shop.findByIdAndUpdate(
        req.params.shopId,
        { isAcceptingUploads },
        { new: true }
      );
      
      if (!shop) {
        return res.status(404).json({ error: 'Shop not found' });
      }
  
      // Emit WebSocket event to all clients in the shop's room
      const io = req.app.get("socketio");
      io.to(`shop_${shop._id}`).emit("shopStatusUpdate", {
        isAcceptingUploads: shop.isAcceptingUploads
      });
      
      res.status(200).json(shop);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update shop status' });
    }
  });


// Fetch shop details by ID route
router.get('/:shopId', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shop details' });
  }
});

// Add these new routes for password reset

// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const shop = await Shop.findOne({ email });
        
        if (!shop) {
            return res.status(404).json({ error: 'No account found with that email' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        // Save reset token to shop
        shop.resetToken = resetToken;
        shop.resetTokenExpiry = resetTokenExpiry;
        await shop.save();

        // In a real application, send email with reset link
        // For now, just return the token
        res.status(200).json({
            message: 'Password reset link sent to email',
            resetToken // In production, this should be sent via email
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        
        const shop = await Shop.findOne({
            resetToken,
            resetTokenExpiry: { $gt: Date.now() }
        });

        if (!shop) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update shop with new password and clear reset token
        shop.password = hashedPassword;
        shop.resetToken = undefined;
        shop.resetTokenExpiry = undefined;
        await shop.save();

        res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset password' });
    }
});


module.exports = router;