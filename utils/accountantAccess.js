const CustomRole = require('../models/CustomRole');
const User = require('../models/User');

async function getAssignedClients(user) {
  if (user.role === 'super_admin') return null;

  if (user.assignedClients && user.assignedClients.length > 0) {
    return user.assignedClients;
  }

  if (user.customRole) {
    const role = await CustomRole.findById(user.customRole).lean();
    if (role) {
      if (role.analyticsViewAll) return null;
      return role.analyticsClients || [];
    }
  }

  return [];
}

function getPeriodConfig(user, role) {
  // User-level takes priority
  if (user.periodType && user.periodType !== 'all') {
    return {
      type: user.periodType,
      days: user.periodDays || 0,
      months: user.periodMonths || 0,
      start: user.periodStart || null,
      end: user.periodEnd || null,
    };
  }
  if (user.periodType === 'all') return { type: 'all' };

  // Fall back to role-level
  if (role && role.periodType && role.periodType !== 'all') {
    return {
      type: role.periodType,
      days: role.periodDays || 0,
      months: role.periodMonths || 0,
      start: role.periodStart || null,
      end: role.periodEnd || null,
    };
  }

  return { type: 'all' };
}

function buildDateFilter(periodConfig) {
  if (!periodConfig || periodConfig.type === 'all') return null;

  const filter = {};

  if (periodConfig.type === 'days' && periodConfig.days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - periodConfig.days);
    filter.$gte = since;
  } else if (periodConfig.type === 'months' && periodConfig.months > 0) {
    const since = new Date();
    since.setMonth(since.getMonth() - periodConfig.months);
    filter.$gte = since;
  } else if (periodConfig.type === 'range') {
    if (periodConfig.start) {
      filter.$gte = new Date(periodConfig.start);
    }
    if (periodConfig.end) {
      const end = new Date(periodConfig.end);
      end.setHours(23, 59, 59, 999);
      filter.$lte = end;
    }
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

async function getAllowedAccountants(user) {
  if (user.role === 'super_admin') return [];

  if (user.customRole) {
    const role = await CustomRole.findById(user.customRole).lean();
    if (role?.canAcceptPayments) {
      if (role.paymentsAcceptAll && (!user.allowedAccountants || user.allowedAccountants.length === 0)) {
        const accountantRoles = await CustomRole.find({ canManagePayments: true }).select('_id').lean();
        const roleIds = accountantRoles.map(r => r._id);
        const accountants = await User.find({ customRole: { $in: roleIds } }).select('_id').lean();
        return accountants.map(a => a._id);
      }
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

module.exports = { getAssignedClients, getPeriodConfig, buildDateFilter, getAllowedAccountants };