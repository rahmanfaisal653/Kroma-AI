import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'kroma_ai_gateway',
});

await conn.execute('DELETE FROM users');
const password = await bcrypt.hash('kolab777', 10);
await conn.execute(
  'INSERT INTO users (email, password, role, status, quota_limit, usage_count, balance, token_version) VALUES (?, ?, ?, ?, 0, 0, 0, 0)',
  ['kroma123@gmail.com', password, 'owner', 'active']
);
await conn.end();
console.log('owner seeded: username/email=kroma123 or kroma123@gmail.com password=kolab777');
