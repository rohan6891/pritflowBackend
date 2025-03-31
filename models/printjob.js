const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        default: null
    },
    fileSize: {
        type: Number,
        default: 0
    }
});

const printJobSchema = new mongoose.Schema({
    shop_id: { type: String, required: true },
    token_number: { type: String, required: true },
    print_type: { type: String, enum: ['bw', 'color'], required: true },
    print_side: { type: String, enum: ['single', 'double'], required: true },
    copies: { type: Number, default: 1 },
    status: { type: String, enum: ['pending', 'completed', 'expired', 'deleted'], default: 'pending' },
    uploaded_at: { type: Date, default: Date.now },
    files: [fileSchema]
});

module.exports = mongoose.model('PrintJob', printJobSchema);