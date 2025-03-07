const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    shop_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    token_number: { type: String, required: true },
    file_path: { type: String, required: true },
    fileSize: { type: Number }, // Added to store file size in bytes
    uploaded_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('File', fileSchema);