const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const CustomRole = require('../models/CustomRole');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createPayment = catchAsync(async (req, res) => {
  const { orderId, clientId, amount } = req.body;

  if (!orderId || !clientId || !amount) {
    throw new AppError('Provide orderId, clientId, and amount', 400);
  }

  const order = await Order.findById(orderId).lean();
  if (!order) throw new AppError('Order not found', 404);
  if (order.client.toString() !== clientId) {
    throw new AppError('Client does not match this order', 400);
  }

  const payment = await Payment.create({
    order: orderId,
    client: clientId,
    amount,
    createdBy: req.user._id,
  });

  const populated = await Payment.findById(payment._id)
    .populate('client', 'name email')
    .populate('order', 'totalPrice status')
    .populate('createdBy', 'name')
    .lean();

  res.status(201).json({ success: true, data: { payment: populated }, error: null, source: 'PAYMENT_CREATE' });
});

exports.getPayments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.user.role !== 'super_admin') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (role?.canManagePayments) {
      const roleWithClients = await CustomRole.findById(req.user.customRole).populate('analyticsClients').lean();
      const clientIds = roleWithClients?.analyticsViewAll
        ? (await User.find({ role: 'client' }).select('_id').lean()).map(u => u._id)
        : (roleWithClients?.analyticsClients || []).map(c => c._id?.toString() ? c._id : c);
      filter.client = { $in: clientIds };
      filter.createdBy = req.user._id;
    } else if (role?.canAcceptPayments) {
      const accountantIds = role?.paymentsAcceptAll
        ? (await CustomRole.find({ canManagePayments: true }).populate({
            path: 'paymentsAccountants',
            match: { role: 'custom_staff' },
          }).lean()).reduce((acc, r) => {
            if (r.paymentsAcceptAll) return acc;
            return [...acc, ...r.paymentsAccountants.map(a => a._id?.toString() ? a._id : a)];
          }, [])
        : [];
      if (role?.paymentsAcceptAll) {
        const accountantUsers = await User.find({ role: 'custom_staff' }).populate({
          path: 'customRole',
          match: { canManagePayments: true },
        }).lean();
        const accIds = accountantUsers.filter(u => u.customRole).map(u => u._id);
        filter.createdBy = { $in: accIds };
      } else if (role?.paymentsAccountants?.length) {
        filter.createdBy = { $in: role.paymentsAccountants };
      } else {
        filter.createdBy = { $in: [] };
      }
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'name email')
      .populate('order', 'totalPrice status')
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

  if (req.user.role !== 'super_admin') {
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (role?.canAcceptPayments) {
      if (!role.paymentsAcceptAll && role.paymentsAccountants?.length) {
        filter.createdBy = { $in: role.paymentsAccountants };
      }
    } else {
      throw new AppError('Not authorized', 403);
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'name email')
      .populate('order', 'totalPrice status')
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
    if (!role.paymentsAcceptAll && role.paymentsAccountants?.length) {
      const accStr = role.paymentsAccountants.map(a => a.toString());
      if (!accStr.includes(payment.createdBy.toString())) {
        throw new AppError('Not authorized to accept from this accountant', 403);
      }
    }
  }

  payment.status = 'accepted';
  payment.acceptedBy = req.user._id;
  payment.acceptedAt = new Date();
  await payment.save();

  const order = await Order.findById(payment.order);
  const newPaidAmount = (order.paidAmount || 0) + payment.amount;
  const newRemaining = order.totalPrice - newPaidAmount;

  order.paidAmount = newPaidAmount;
  order.remainingAmount = Math.max(0, newRemaining);
  order.payments.push({
    payment: payment._id,
    amount: payment.amount,
    acceptedBy: req.user._id,
    acceptedAt: new Date(),
  });

  if (newRemaining <= 0) {
    order.paymentStatus = 'paid';
  } else if (newPaidAmount > 0) {
    order.paymentStatus = 'partial';
  }

  await order.save();

  const populated = await Payment.findById(payment._id)
    .populate('client', 'name email')
    .populate('order', 'totalPrice status paidAmount remainingAmount paymentStatus')
    .populate('createdBy', 'name')
    .populate('acceptedBy', 'name')
    .lean();

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

  res.json({ success: true, data: { payment }, error: null, source: 'PAYMENT_REJECT' });
});

exports.getPaymentAccountants = catchAsync(async (req, res) => {
  const accountantRoles = await CustomRole.find({ canManagePayments: true }).select('_id').lean();
  const roleIds = accountantRoles.map(r => r._id);
  const accountants = await User.find({ customRole: { $in: roleIds } }).select('name email').sort('name').lean();
  res.json({ success: true, data: { accountants }, error: null, source: 'PAYMENT_ACCOUNTANTS' });
});