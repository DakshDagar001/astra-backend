import { hashPassword } from '../auth/password.js';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: npm run hash-password -- "<your-password>"');
    process.exit(1);
  }

  try {
    const hash = await hashPassword(password);
    console.log('\nGenerated Argon2id Hash:');
    console.log(hash);
    console.log('\nSet this in your environment as:');
    console.log(`ASTRA_PASSWORD_HASH='${hash}'\n`);
  } catch (err) {
    console.error('Failed to hash password:', err);
    process.exit(1);
  }
}

main();
