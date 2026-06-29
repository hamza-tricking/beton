const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    enum: ['super_admin', 'client', 'custom_staff'],
    default: 'client',
  },
  customRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomRole',
    default: null,
  },
  assignedClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  periodType: { type: String, enum: ['all', 'days', 'months', 'range'], default: 'all' },
  periodDays: { type: Number, default: 0 },
  periodMonths: { type: Number, default: 0 },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  allowedAccountants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  refreshToken: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
