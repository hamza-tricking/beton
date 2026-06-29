const CustomRole = require('../models/CustomRole');
const User = require('../models/User');

async function getAssignedClients(user) {
  if (user.role === 'super_admin') return null;

  // User-level assignedClients takes priority
  if (user.assignedClients && user.assignedClients.length > 0) {
    return user.assignedClients;
  }

  // Fall back to role-level
  if (user.customRole) {
    const role = await CustomRole.findById(user.customRole).lean();
    if (role) {
      if (role.analyticsViewAll) return null; // null = all clients
      return role.analyticsClients || [];
    }
  }

  return [];
}

async function getViewPeriodDays(user) {
  if (user.role === 'super_admin') return 0;

  // User-level takes priority
  if (user.viewPeriodDays && user.viewPeriodDays > 0) {
    return user.viewPeriodDays;
  }

  // Fall back to role-level
  if (user.customRole) {
    const role = await CustomRole.findById(user.customRole).lean();
    if (role) return role.analyticsPeriodDays || 0;
  }

  return 0;
}

async function getAllowedAccountants(user) {
  if (user.role === 'super_admin') return null;

  if (user.customRole) {
    const role = await CustomRole.findById(user.customRole).lean();
    if (role?.canAcceptPayments) {
      if (role.paymentsAcceptAll && (!user.allowedAccountants || user.allowedAccountants.length === 0)) {
        const accountantRoles = await CustomRole.find({ canManagePayments: true }).select('_id').lean();
        const roleIds = accountantRoles.map(r => r._id);
        const accountants = await User.find({ customRole: { $in: roleIds } }).select('_id').lean();
        return accountants.map(a => a._id);
      }
      // User-level allowedAccountants takes priority over role-level paymentsAccountants
      if (user.allowedAccountants && user.allowedAccountants.length > 0) {
        return user.allowedAccountants;
      }
      if (role.paymentsAccountants && role.paymentsAccountants.length > 0) {
        return role.paymentsAccountants;
      }
    }
  }

  return [];
}

module.exports = { getAssignedClients, getViewPeriodDays, getAllowedAccountants };