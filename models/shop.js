const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerName: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    password: { type: String, required: true},
    qr_code: { type: String, default:null },
    bw_cost_per_page: { type: Number, required: true },
    color_cost_per_page: { type: Number, required: true },
    created_at: { type: Date, default: Date.now },
    resetToken: String,
    resetTokenExpiry: Date,
    isAcceptingUploads: { type: Boolean, default: true }
});

module.exports = mongoose.model('Shop', shopSchema);