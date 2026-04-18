import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;
try {
  const Database = require('better-sqlite3');
  const dbPath = join(__dirname, 'bakery.db');
  db = new Database(dbPath, { verbose: console.log });
  db.pragma('foreign_keys = ON');
  console.log(`📊 SQLite database connected: ${dbPath}`);
} catch (e) {
  console.warn('⚠️  SQLite (better-sqlite3) not available — SQLite routes disabled. Using Supabase only.');
}

export default db;

