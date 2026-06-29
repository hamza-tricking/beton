const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, default: null },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  targetDisplay: { type: String, default: '' },
  description: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
}, { timestamps: true });

historySchema.index({ createdAt: -1 });
historySchema.index({ action: 1, createdAt: -1 });
historySchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('History', historySchema);
