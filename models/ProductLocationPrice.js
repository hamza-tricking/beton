const mongoose = require('mongoose');

const productLocationPriceSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
  },
  priceOffset: { type: Number, required: true, default: 0 },
}, { timestamps: true });

productLocationPriceSchema.index({ product: 1, location: 1 }, { unique: true });

module.exports = mongoose.model('ProductLocationPrice', productLocationPriceSchema);
