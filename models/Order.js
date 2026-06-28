const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null,
  },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  globalLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null,
  },
  items: [orderItemSchema],
  totalPrice: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'shipped', 'completed', 'cancelled'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
