import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

// Sembunyikan ketikan password.
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};

rl.question('Password admin baru (minimal 12 karakter): ', (password) => {
  muted = false;
  console.log();
  rl.close();

  if (password.length < 12) {
    console.error('Password terlalu pendek. Gunakan minimal 12 karakter.');
    process.exit(1);
  }

  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  console.log('\nSalin baris ini ke .env.local dan Environment Variables Vercel:\n');
  console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt}:${hash}\n`);
});

muted = true;
