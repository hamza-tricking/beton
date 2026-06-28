const config = require('./config/env');
const AppError = require('./utils/AppError');

const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    success: false,
    data: null,
    error: err.message,
    stack: err.stack,
    source: err.constructor.name,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      error: err.message,
      source: err.constructor.name,
    });
  }
  console.error('❌ [BE] Unexpected error:', err);
  res.status(500).json({
    success: false,
    data: null,
    error: 'Something went wrong',
    source: 'UNKNOWN',
  });
};

const globalErrorHandler = (err, req, res, next) => {
  if (config.isProduction) {
    sendErrorProd(err, res);
  } else {
    sendErrorDev(err, res);
  }
};

module.exports = globalErrorHandler;
