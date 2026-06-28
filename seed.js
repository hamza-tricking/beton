require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config/env');
const User = require('./models/User');

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('📂 [BE] Connected to MongoDB');

    const existing = await User.findOne({ role: 'super_admin' }).lean();
    if (existing) {
      console.log('✅ Super admin already exists:');
      console.log(`   Email: ${existing.email}`);
      return process.exit(0);
    }

    const hashedPassword = await bcrypt.hash('admin123', 12);
    const admin = await User.create({
      name: 'Super Admin',
      email: 'admin@beton.dz',
      password: hashedPassword,
      role: 'super_admin',
    });

    console.log('✅ Super admin created successfully:');
    console.log(`   Email:    admin@beton.dz`);
    console.log(`   Password: admin123`);
    process.exit(0);
  } catch (err) {
    console.error('❌ [BE] Seed error:', err.message);
    process.exit(1);
  }
};

seedSuperAdmin();
