import mongoose from 'mongoose';

async function initializeSuperAdmin() {
  const mongoUri = process.env.MONGO_URI;
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!mongoUri) throw new Error('MONGO_URI is required');
  if (!email) throw new Error('SUPER_ADMIN_EMAIL is required');

  await mongoose.connect(mongoUri);
  try {
    const users = mongoose.connection.collection('users');
    await users.createIndex({ superAdmin: 1 }, {
      unique: true,
      partialFilterExpression: { superAdmin: true },
    });
    if (await users.findOne({ superAdmin: true })) {
      throw new Error('A Super Admin is already initialized; no account was changed');
    }

    const result = await users.updateOne(
      { email, role: 'owner', isActive: true, superAdmin: { $ne: true } },
      { $set: { superAdmin: true } },
    );
    if (result.modifiedCount !== 1) {
      throw new Error('No active owner account matched that email; no account was changed');
    }
    console.log(`Initialized Super Admin for ${email}. Sign in through the existing login and PIN flow.`);
  } finally {
    await mongoose.disconnect();
  }
}

void initializeSuperAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Super Admin initialization failed');
  process.exitCode = 1;
});