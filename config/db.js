const mongoose = require('mongoose');
const config = require('./config/env');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri);
    console.log(`📂 [BE] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ [BE] MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
