const express = require('express');
const router = express.Router();
const Shop = require('../models/shop');
const PrintJob = require('../models/printjob');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

// Fetch shop details by ID
router.get('/:shopId', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.shopId).select('name bw_cost_per_page color_cost_per_page isAcceptingUploads');
        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }
        res.status(200).json(shop);
    } catch (error) {
        console.error("Error fetching shop details:", error);
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
            status: { $ne: 'deleted' }
        }).sort({ uploaded_at: -1 });

        console.log(`Fetched ${printJobs.length} print jobs for shop ${req.params.shopId} today.`);
        res.status(200).json(printJobs);
    } catch (error) {
        console.error(`Error fetching print jobs for shop ${req.params.shopId}:`, error);
        res.status(500).json({ error: 'Failed to fetch print jobs' });
    }
});

// Fetch job status by token
router.get('/status/:token', async (req, res) => {
    try {
        const printJob = await PrintJob.findOne({ token_number: req.params.token });
        if (!printJob) {
            return res.status(404).json({ error: 'Print job not found or already processed/deleted.' });
        }
        res.status(200).json({
            status: printJob.status,
            fileName: printJob.fileName,
            print_type: printJob.print_type,
            print_side: printJob.print_side,
            copies: printJob.copies
        });
    } catch (error) {
        console.error(`Error fetching status for token ${req.params.token}:`, error);
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

// Update print job status
router.put('/:jobId', async (req, res) => {
    try {
        const { status } = req.body;
        const job = await PrintJob.findById(req.params.jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Print job not found' });
        }
        
        // Delete physical files if status is 'completed' or 'deleted'
        if ((status === 'completed' || status === 'deleted') && job.files && job.files.length > 0) {
            for (const file of job.files) {
                if (file.filePath) {
                    try {
                        const filePath = path.resolve(__dirname, '..', file.filePath);
                        await fs.unlink(filePath);
                    } catch (err) {
                        console.error(`Error deleting file: ${err.message}`);
                    }
                }
            }
        }
        
        // Update job status and clear file paths
        const updatedJob = await PrintJob.findByIdAndUpdate(
            req.params.jobId,
            { 
                status: status,
                ...(status === 'completed' || status === 'deleted' ? { 'files.$[].filePath': null } : {})
            },
            { new: true }
        );

        // Emit WebSocket event for single job status update
        const io = req.app.get("socketio");
        if (io) {
            io.to(`shop_${updatedJob.shop_id}`).emit('jobStatusUpdate', {
                id: updatedJob._id,
                token: updatedJob.token_number,
                status: updatedJob.status,
            });
        }

        res.status(200).json(updatedJob);
    } catch (error) {
        console.error('Error updating print job status:', error);
        res.status(500).json({ error: 'Failed to update print job status' });
    }
});

// Update status for all jobs in a batch (by Token)
router.put('/status-batch/:token', async (req, res) => {
    const { status } = req.body;
    const token = req.params.token;
    const io = req.app.get("socketio");

    if (!status || !['completed', 'deleted'].includes(status)) {
        return res.status(400).json({ error: 'Invalid or missing status. Must be "completed" or "deleted".' });
    }

    try {
        const jobsToUpdate = await PrintJob.find({ token_number: token });

        if (jobsToUpdate.length === 0) {
            return res.status(404).json({ error: 'No print jobs found for this token.' });
        }

        const shopId = jobsToUpdate[0].shop_id;
        
        // Delete physical files for both 'completed' and 'deleted' statuses
        for (const job of jobsToUpdate) {
            if (job.files && job.files.length > 0) {
                for (const file of job.files) {
                    if (file.filePath) {
                        try {
                            const filePath = path.resolve(__dirname, '..', file.filePath);
                            await fs.unlink(filePath);
                            console.log(`Deleted file: ${filePath}`);
                        } catch (err) {
                            console.error(`Error deleting file: ${err.message}`);
                            // Continue with other files even if one fails
                        }
                    }
                }
            }
        }

        // Update the database records
        const result = await PrintJob.updateMany(
            { token_number: token },
            { 
                $set: { 
                    status: status,
                    // Clear file paths for both completed and deleted jobs
                    'files.$[].filePath': null
                } 
            }
        );

        // Emit WebSocket event
        if (io && shopId) {
            io.to(`shop_${shopId}`).emit('batchStatusUpdate', {
                token: token,
                status: status,
                count: result.modifiedCount
            });
        }

        res.status(200).json({
            message: `${result.modifiedCount} jobs marked as ${status} for token ${token}.`,
            updatedCount: result.modifiedCount
        });

    } catch (error) {
        console.error(`Error updating batch status to '${status}' for token ${token}:`, error);
        res.status(500).json({ error: `Failed to update batch status to ${status}` });
    }
});

// Delete print job (set file_path to null and status to "deleted")
router.delete('/:jobId', async (req, res) => {
    try {
        const job = await PrintJob.findById(req.params.jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Print job not found' });
        }
        
        const shopId = job.shop_id;
        
        // Delete physical files
        if (job.files && job.files.length > 0) {
            for (const file of job.files) {
                if (file.filePath) {
                    try {
                        const filePath = path.resolve(__dirname, '..', file.filePath);
                        await fs.unlink(filePath);
                    } catch (err) {
                        console.error(`Error deleting file: ${err.message}`);
                        // Continue with other files even if one fails
                    }
                }
            }
        }
        
        // Update job status to deleted and clear file paths
        const updatedJob = await PrintJob.findByIdAndUpdate(
            req.params.jobId,
            { 
                status: 'deleted',
                'files.$[].filePath': null
            },
            { new: true }
        );
        
        // Emit WebSocket event
        const io = req.app.get("socketio");
        if (io) {
            io.to(`shop_${shopId}`).emit('jobStatusUpdate', {
                id: updatedJob._id,
                token: updatedJob.token_number,
                status: 'deleted'
            });
        }
        
        res.status(200).json({ 
            message: 'Job deleted successfully',
            job: updatedJob
        });
        
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

// Delete all jobs in a batch (by Token)
router.delete('/delete-batch/:token', async (req, res) => {
    const token = req.params.token;
    const io = req.app.get("socketio");

    try {
        const jobsToDelete = await PrintJob.find({ token_number: token });

        if (jobsToDelete.length === 0) {
            return res.status(404).json({ error: 'No print jobs found for this token.' });
        }

        const shopId = jobsToDelete[0].shop_id;

        const result = await PrintJob.updateMany(
            { token_number: token },
            { $set: { status: 'deleted' } }
        );

        console.log(`Marked ${result.modifiedCount} jobs as 'deleted' for token ${token}`);

        if (io && shopId) {
            io.to(`shop_${shopId}`).emit('batchStatusUpdate', {
                token: token,
                status: 'deleted',
                count: result.modifiedCount
            });
            console.log(`WebSocket: Sent batchStatusUpdate (deleted) for token ${token} to room shop_${shopId}`);
        }

        res.status(200).json({
            message: `${result.modifiedCount} jobs marked as deleted for token ${token}.`,
            deletedCount: result.modifiedCount
        });

    } catch (error) {
        console.error(`Error deleting batch for token ${token}:`, error);
        res.status(500).json({ error: 'Failed to delete batch' });
    }
});

// Download files for a job or batch
router.get('/download-batch/:token', async (req, res) => {
    const token = req.params.token;
    try {
        const jobs = await PrintJob.find({
            token_number: token,
            status: { $ne: 'deleted' }
        });

        if (jobs.length === 0) {
            return res.status(404).json({ error: 'No jobs found for this token.' });
        }

        // Collect all files with valid paths
        const filesToDownload = [];
        for (const job of jobs) {
            if (job.files && job.files.length > 0) {
                for (const file of job.files) {
                    if (file.filePath) {
                        try {
                            const filePath = path.resolve(__dirname, '..', file.filePath);
                            await fs.access(filePath); // Check if file exists
                            filesToDownload.push({
                                path: filePath,
                                name: file.fileName
                            });
                        } catch (err) {
                            console.warn(`File not accessible: ${file.filePath}`, err.code);
                        }
                    }
                }
            }
        }

        if (filesToDownload.length === 0) {
            return res.status(404).json({ error: 'No downloadable files found for this token.' });
        }

        // If only one file, send it directly
        if (filesToDownload.length === 1) {
            const file = filesToDownload[0];
            console.log(`Sending single file: ${file.path}`);
            return res.download(file.path, file.name);
        }

        // For multiple files, create a zip
        const zipFilename = `printjob-${token}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', { 
            zlib: { level: 3 } // Even lower compression level for better compatibility
        });

        archive.on('warning', function(err) {
            console.warn('Archiver warning:', err);
        });
        
        archive.on('error', function(err) {
            console.error('Archiver error:', err);
            if (!res.headersSent) {
                res.status(500).send({ error: 'Failed to create ZIP archive.' });
            }
        });

        archive.pipe(res);

        // Add each file to the archive
        for (const file of filesToDownload) {
            archive.file(file.path, { name: file.name });
            console.log(`Added to archive: ${file.name}`);
        }

        await archive.finalize();
        console.log(`Successfully sent ${filesToDownload.length} files for token ${token}`);

    } catch (error) {
        console.error(`Error downloading files for token ${token}:`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download files' });
        }
    }
});

module.exports = router;