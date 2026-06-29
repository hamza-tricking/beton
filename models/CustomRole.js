const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
  roleName: { type: String, required: true, trim: true },
  canCreateOrder: { type: Boolean, default: false },
  canCreateProduct: { type: Boolean, default: false },
  canViewAnalytics: { type: Boolean, default: false },
  canManageUsers: { type: Boolean, default: false },

  // Payment management (accountant role)
  canManagePayments: { type: Boolean, default: false },

  // Analytics sub-config (when canViewAnalytics is true)
  analyticsViewAll: { type: Boolean, default: true },
  analyticsClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  analyticsPeriodDays: { type: Number, default: 0 },

  // Payment acceptance sub-config
  canAcceptPayments: { type: Boolean, default: false },
  paymentsAcceptAll: { type: Boolean, default: true },
  paymentsAccountants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('CustomRole', customRoleSchema);
