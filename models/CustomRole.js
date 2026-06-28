const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
  roleName: { type: String, required: true, trim: true },
  canCreateOrder: { type: Boolean, default: false },
  canCreateProduct: { type: Boolean, default: false },
  canViewAnalytics: { type: Boolean, default: false },
  canManageUsers: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('CustomRole', customRoleSchema);
