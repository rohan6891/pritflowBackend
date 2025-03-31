const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const Customer = require('../models/customer');
const File = require('../models/file');
const PrintJob = require('../models/printjob');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/'); // Ensure this directory exists
    },
    filename: function(req, file, cb) {
        // Sanitize filename if necessary, or use a unique ID
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});

// Configure multer instance
const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } // Increased limit slightly just in case
});

// Add a health check endpoint
router.get('/health', (req, res) => {
    res.status(200).send('Upload route OK');
});

// Modify the upload route to handle multiple files in a single job
router.post('/:shopId', upload.array('files', 10), async (req, res) => {
    console.log(`Upload handler reached for shop: ${req.params.shopId}`);
    
    try {
        const shopId = req.params.shopId;
        
        // Validate files
        if (!req.files || req.files.length === 0) {
            console.error('No files uploaded');
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        // Validate print options
        const { print_type, print_side, copies } = req.body;
        if (!print_type || !print_side || !copies) {
            console.error('Missing print options');
            return res.status(400).json({ error: 'Missing print options' });
        }
        
        // Generate a single token for all files
        const token = generateToken();
        
        // Create a single print job with all files
        const printJob = new PrintJob({
            shop_id: shopId,
            token_number: token,
            print_type,
            print_side,
            copies: parseInt(copies, 10) || 1,
            status: 'pending',
            files: req.files.map(file => ({
                fileName: file.originalname,
                filePath: file.path,
                fileSize: file.size
            }))
        });
        
        const savedJob = await printJob.save();
        console.log(`Created print job with token ${token} and ${req.files.length} files`);
        
        // Emit WebSocket notification
        const io = req.app.get("socketio");
        if (io) {
            io.to(`shop_${shopId}`).emit('newBatchPrintJob', {
                id: savedJob._id,
                token: savedJob.token_number,
                files: savedJob.files,
                printType: savedJob.print_type,
                printSide: savedJob.print_side,
                copies: savedJob.copies,
                status: savedJob.status,
                uploadTime: savedJob.uploaded_at
            });
            console.log(`Sent WebSocket notification for new batch job to shop_${shopId}`);
        }
        
        res.status(201).json({
            message: `${req.files.length} files uploaded successfully`,
            token_number: token,
            count: req.files.length,
            files: req.files.map(file => ({
                fileName: file.originalname,
                fileSize: file.size
            }))
        });
        
    } catch (error) {
        console.error('Error in upload handler:', error);
        res.status(500).json({ error: 'Server error during file processing' });
    }
});

// Helper function (ensure this exists)
function generateToken(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

module.exports = router;