const express = require('express');
const router = express.Router();
const Shop = require('../models/shop');
const PrintJob = require('../models/printjob');
const fs = require('fs').promises;
const path = require('path');

// Fetch shop details by ID
router.get('/:shopId', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.shopId).select('name bw_cost_per_page color_cost_per_page');
        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }
        res.status(200).json(shop);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shop details' });
    }
});

// Fetch print jobs by shop ID, filtered by current day
router.get('/prints/:shopId', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const printJobs = await PrintJob.find({
            shop_id: req.params.shopId,
            uploaded_at: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['pending', 'completed'] } // Exclude "deleted" status
        });
        console.log("Fetched print jobs for today:", printJobs);
        res.status(200).json(printJobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch print jobs' });
    }
});

// Fetch job status by token
router.get('/status/:token', async (req, res) => {
    try {
        const printJob = await PrintJob.findOne({ token_number: req.params.token });
        if (!printJob) {
            return res.status(404).json({ error: 'Print job not found' });
        }
        res.status(200).json({
            status: printJob.status,
            fileName: printJob.fileName,
            print_type: printJob.print_type,
            print_side: printJob.print_side,
            copies: printJob.copies
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

// Update print job status
router.put('/:jobId', async (req, res) => {
    try {
        const { status } = req.body;
        const printJob = await PrintJob.findByIdAndUpdate(
            req.params.jobId,
            { status },
            { new: true }
        );
        
        if (!printJob) {
            return res.status(404).json({ error: 'Print job not found' });
        }

        // Delete the file from disk if file_path exists
        if (printJob.file_path) {
            const filePath = path.join(__dirname, '..', printJob.file_path);
            try {
                await fs.unlink(filePath);
                console.log(`Deleted file: ${filePath}`);
            } catch (fileError) {
                console.error('Error deleting file from disk:', fileError);
            }
        }

        const io = req.app.get("socketio");
        io.emit('jobStatusUpdate', {
            id: printJob._id,
            token: printJob.token_number,
            status: printJob.status,
            fileName: printJob.fileName,
            print_type: printJob.print_type,
            print_side: printJob.print_side,
            copies: printJob.copies,
            uploaded_at: printJob.uploaded_at,
            file_path: printJob.file_path,
            fileSize: printJob.fileSize
        });

        res.status(200).json(printJob);
    } catch (error) {
        console.error('Error updating print job:', error);
        res.status(500).json({ error: 'Failed to update print job status' });
    }
});

// Delete print job (set file_path to null and status to "deleted")
router.delete('/:jobId', async (req, res) => {
    try {
        const printJob = await PrintJob.findById(req.params.jobId);
        
        if (!printJob) {
            return res.status(404).json({ error: 'Print job not found' });
        }

        // Delete the file from disk if file_path exists
        if (printJob.file_path) {
            const filePath = path.join(__dirname, '..', printJob.file_path);
            try {
                await fs.unlink(filePath);
                console.log(`Deleted file: ${filePath}`);
            } catch (fileError) {
                console.error('Error deleting file from disk:', fileError);
            }
        }

        // Update the document: set file_path to null and status to "deleted"
        const updatedJob = await PrintJob.findByIdAndUpdate(
            req.params.jobId,
            { file_path: null, status: 'deleted' },
            { new: true }
        );

        res.status(200).json({ message: 'Print job file deleted and marked as deleted', job: updatedJob });
    } catch (error) {
        console.error('Error deleting print job:', error);
        res.status(500).json({ error: 'Failed to delete print job' });
    }
});

module.exports = router;