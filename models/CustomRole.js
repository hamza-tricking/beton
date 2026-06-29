const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
  roleName: { type: String, required: true, trim: true },
  canCreateOrder: { type: Boolean, default: false },
  canCreateProduct: { type: Boolean, default: false },
  canViewAnalytics: { type: Boolean, default: false },
  canManageUsers: { type: Boolean, default: false },
  canManageLocation: { type: Boolean, default: false },

  // Payment management (accountant role)
  canManagePayments: { type: Boolean, default: false },

  // Analytics sub-config (when canViewAnalytics is true)
  analyticsViewAll: { type: Boolean, default: true },
  analyticsClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  periodType: { type: String, enum: ['all', 'days', 'months', 'range'], default: 'all' },
  periodDays: { type: Number, default: 0 },
  periodMonths: { type: Number, default: 0 },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },

  // Payment acceptance sub-config
  canAcceptPayments: { type: Boolean, default: false },
  paymentsAcceptAll: { type: Boolean, default: true },
  paymentsAccountants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('CustomRole', customRoleSchema);
