const History = require('../models/History');

const logAction = async (action, actorId, options = {}) => {
  const {
    targetType = null,
    targetId = null,
    targetDisplay = '',
    description = '',
    details = {},
    ip = '',
    userAgent = '',
  } = options;

  try {
    await History.create({
      action,
      actor: actorId,
      targetType,
      targetId,
      targetDisplay,
      description,
      details,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[HISTORY] Failed to log action:', err.message);
  }
};

module.exports = { logAction };
