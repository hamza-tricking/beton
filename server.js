require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const connectDB = require('./config/db');
const globalErrorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

connectDB();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  config.clientUrl,
  'http://localhost:3000',
  'https://dmtart.pro',
  'https://www.dmtart.pro',
  'https://betonfront.vercel.app',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, data: null, error: 'Too many requests, please try again later', source: 'RATE_LIMITER' },
});
app.use('/api', limiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'OK' }, error: null, source: 'HEALTH' });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/locations', require('./routes/locationRoutes'));
app.use('/api/pricing', require('./routes/pricingRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));

app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use(globalErrorHandler);

const server = app.listen(config.port, () => {
  console.log(`📂 [BE] Server running on port ${config.port} in ${config.nodeEnv} mode`);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ [BE] Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = app;
