const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const Customer = require('../models/customer');
const File = require('../models/file');
const PrintJob = require('../models/printjob');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Handle file upload and create print job
router.post('/:shopId', upload.single('file'), async (req, res) => {
    const { shopId } = req.params;
    const { print_type, print_side, copies } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const token_number = Math.floor(10000 + Math.random() * 90000).toString();
        const file_path = req.file.path;
        const fileSize = req.file.size; // Get file size from Multer

        // Create a new file entry with fileSize
        const newFile = new File({
            shop_id: shopId,
            token_number,
            file_path,
            fileSize // Save file size
        });
        await newFile.save();

        // Create a new print job entry with fileSize
        const newPrintJob = new PrintJob({
            shop_id: shopId,
            token_number,
            file_path,
            print_type,
            print_side,
            copies,
            fileName: req.file.originalname, // Include file name
            fileSize, // Include file size
            status: 'pending',
            uploaded_at: new Date()
        });
        await newPrintJob.save();

        // Emit WebSocket event with fileSize
        const io = req.app.get("socketio");
        console.log("Emitting newPrintJob event:", newPrintJob._id); // Debug log
        io.emit("newPrintJob", {
            id: newPrintJob._id,
            fileType: path.extname(req.file.originalname).slice(1), // e.g., "pdf"
            printType: newPrintJob.print_type,
            printSide: newPrintJob.print_side,
            copies: newPrintJob.copies,
            token: newPrintJob.token_number,
            status: newPrintJob.status,
            uploadTime: newPrintJob.uploaded_at,
            fileName: newPrintJob.fileName,
            fileSize: newPrintJob.fileSize // Include file size in event
        });

        res.status(201).json({ message: 'File uploaded and print job created', token_number });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create print job' });
    }
});

// Route to handle file download
router.get('/download/:filePath', async (req, res) => {
    const filePath = req.params.filePath;
    const fullPath = path.join(__dirname, '..', filePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Send the file
    res.download(fullPath, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            res.status(500).json({ error: 'Failed to download file' });
        }
    });
});

module.exports = router;