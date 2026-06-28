const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  basePrice: { type: Number, required: true, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
