const Payment = require('../models/Payment');
const User = require('../models/User');
const CustomRole = require('../models/CustomRole');
const { getAssignedClients, getAllowedAccountants } = require('../utils/accountantAccess');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

exports.createPayment = catchAsync(async (req, res) => {
  const { clientId, amount } = req.body;

  if (!clientId || !amount || amount <= 0) {
    throw new AppError('Provide clientId and amount greater than 0', 400);
  }

  const client = await User.findById(clientId).select('name totalDebt').lean();
  if (!client) throw new AppError('Client not found', 404);

  const payment = await Payment.create({
    client: clientId,
    amount,
    debtBefore: client.totalDebt || 0,
    debtAfter: client.totalDebt || 0,
    createdBy: req.user._id,
  });

  const populated = await Payment.findById(payment._id)
    .populate('client', 'name email totalDebt')
    .populate('createdBy', 'name')
    .lean();

  const clientName = populated.client?.name || 'غير معروف';
  logAction('PAYMENT_CREATE', req.user._id, {
    targetType: 'Payment',
    targetId: payment._id,
    targetDisplay: `دفعة ${amount} دج`,
    description: `قام ${req.user.name} بتسجيل دفعة بقيمة ${amount.toLocaleString()} دج للزبون ${clientName} (الدين: ${(client.totalDebt || 0).toLocaleString()} دج)`,
    details: { clientId, clientName, amount, debtBefore: client.totalDebt },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { payment: populated }, error: null, source: 'PAYMENT_CREATE' });
});

exports.getPayments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.user.role === 'custom_staff') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (role?.canManagePayments) {
      const clients = await getAssignedClients(req.user);
      if (clients !== null) {
        filter.client = { $in: clients.length > 0 ? clients : [] };
      }
      filter.createdBy = req.user._id;
    } else if (role?.canAcceptPayments) {
      const accountants = await getAllowedAccountants(req.user);
      if (accountants.length > 0) {
        filter.createdBy = { $in: accountants };
      } else {
        filter.createdBy = { $in: [] };
      }
    }
  }

  if (req.query.clientId) {
    filter.client = filter.client?.$in
      ? { $in: filter.client.$in.filter((c) => c.toString() === req.query.clientId) }
      : req.query.clientId;
  }
  if (req.query.createdBy) {
    filter.createdBy = filter.createdBy?.$in
      ? { $in: filter.createdBy.$in.filter((c) => c.toString() === req.query.createdBy) }
      : req.query.createdBy;
  }
  if (req.query.acceptedBy) filter.acceptedBy = req.query.acceptedBy;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'name email totalDebt')
      .populate('createdBy', 'name')
      .populate('acceptedBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  res.json({ success: true, data: { payments, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'PAYMENT_LIST' });
});

exports.getPendingPayments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = { status: 'pending' };

  if (req.user.role === 'custom_staff') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (!role?.canAcceptPayments) throw new AppError('Not authorized', 403);
    const accountants = await getAllowedAccountants(req.user);
    if (accountants.length > 0) {
      filter.createdBy = { $in: accountants };
    } else {
      filter.createdBy = { $in: [] };
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'name email totalDebt')
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  res.json({ success: true, data: { payments, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'PAYMENT_PENDING' });
});

exports.acceptPayment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const payment = await Payment.findById(id);
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.status !== 'pending') throw new AppError('Payment is not pending', 400);

  if (req.user.role !== 'super_admin') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (!role?.canAcceptPayments) throw new AppError('Not authorized', 403);
    const accountants = await getAllowedAccountants(req.user);
    if (accountants.length > 0) {
      const accStr = accountants.map(a => a.toString());
      if (!accStr.includes(payment.createdBy.toString())) {
        throw new AppError('Not authorized to accept from this accountant', 403);
      }
    }
  }

  const client = await User.findById(payment.client);
  if (!client) throw new AppError('Client not found', 404);

  const currentDebt = client.totalDebt || 0;
  const newDebt = Math.max(0, currentDebt - payment.amount);

  payment.status = 'accepted';
  payment.acceptedBy = req.user._id;
  payment.acceptedAt = new Date();
  payment.debtBefore = currentDebt;
  payment.debtAfter = newDebt;
  await payment.save();

  client.totalDebt = newDebt;
  await client.save();

  const populated = await Payment.findById(payment._id)
    .populate('client', 'name email totalDebt')
    .populate('createdBy', 'name')
    .populate('acceptedBy', 'name')
    .lean();

  const clientName = populated.client?.name || 'غير معروف';
  logAction('PAYMENT_ACCEPT', req.user._id, {
    targetType: 'Payment',
    targetId: payment._id,
    targetDisplay: `دفعة ${payment.amount} دج`,
    description: `قام ${req.user.name} بقبول دفعة بقيمة ${payment.amount.toLocaleString()} دج من الزبون ${clientName} (الدين: ${currentDebt.toLocaleString()} ← ${newDebt.toLocaleString()} دج)`,
    details: { paymentId: payment._id, amount: payment.amount, clientName, debtBefore: currentDebt, debtAfter: newDebt },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { payment: populated }, error: null, source: 'PAYMENT_ACCEPT' });
});

exports.rejectPayment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const payment = await Payment.findById(id);
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.status !== 'pending') throw new AppError('Payment is not pending', 400);

  if (req.user.role !== 'super_admin') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (!role?.canAcceptPayments) throw new AppError('Not authorized', 403);
  }

  payment.status = 'rejected';
  payment.acceptedBy = req.user._id;
  payment.acceptedAt = new Date();
  await payment.save();

  const populatedRejected = await Payment.findById(payment._id)
    .populate('client', 'name email')
    .populate('createdBy', 'name')
    .lean();

  const clientName = populatedRejected?.client?.name || 'غير معروف';
  logAction('PAYMENT_REJECT', req.user._id, {
    targetType: 'Payment',
    targetId: payment._id,
    targetDisplay: `دفعة ${payment.amount} دج`,
    description: `قام ${req.user.name} برفض دفعة بقيمة ${payment.amount.toLocaleString()} دج من الزبون ${clientName}`,
    details: { paymentId: payment._id, amount: payment.amount, clientName },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { payment }, error: null, source: 'PAYMENT_REJECT' });
});

exports.getPaymentFilterOptions = catchAsync(async (req, res) => {
  let clientFilter = { role: 'client' };
  let paymentBaseFilter = {};

  if (req.user.role === 'custom_staff') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    const assignedClients = await getAssignedClients(req.user);

    if (role?.canManagePayments) {
      if (assignedClients !== null) {
        clientFilter._id = { $in: assignedClients.length > 0 ? assignedClients : [] };
        paymentBaseFilter.client = { $in: assignedClients.length > 0 ? assignedClients : [] };
      }
      paymentBaseFilter.createdBy = req.user._id;
    } else if (role?.canAcceptPayments) {
      const accountants = await getAllowedAccountants(req.user);
      paymentBaseFilter.createdBy = accountants.length > 0 ? { $in: accountants } : { $in: [] };
      if (assignedClients !== null) {
        clientFilter._id = { $in: assignedClients.length > 0 ? assignedClients : [] };
      }
    }
  }

  const [clients, createdByUserIds, acceptedByUserIds] = await Promise.all([
    User.find(clientFilter).select('name email totalDebt').sort('name').lean(),
    Payment.distinct('createdBy', paymentBaseFilter),
    Payment.distinct('acceptedBy', { ...paymentBaseFilter, acceptedBy: { $ne: null } }),
  ]);

  const [createdByDocs, acceptedByDocs] = await Promise.all([
    createdByUserIds.length > 0
      ? User.find({ _id: { $in: createdByUserIds } }).select('name email').sort('name').lean()
      : [],
    acceptedByUserIds.length > 0
      ? User.find({ _id: { $in: acceptedByUserIds } }).select('name email').sort('name').lean()
      : [],
  ]);

  res.json({
    success: true,
    data: { clients, createdByUsers: createdByDocs, acceptedByUsers: acceptedByDocs },
    error: null,
    source: 'PAYMENT_FILTER_OPTIONS',
  });
});

exports.getPaymentAccountants = catchAsync(async (req, res) => {
  const accountantRoles = await CustomRole.find({ canManagePayments: true }).select('_id').lean();
  const roleIds = accountantRoles.map(r => r._id);
  const accountants = await User.find({ customRole: { $in: roleIds } }).select('name email').sort('name').lean();
  res.json({ success: true, data: { accountants }, error: null, source: 'PAYMENT_ACCOUNTANTS' });
});
