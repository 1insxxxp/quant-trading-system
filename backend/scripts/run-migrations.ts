import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'quant_trading',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function runMigration(name: string, sqlPath: string): Promise<void> {
  const pool = new Pool(DB_CONFIG);

  try {
    console.log(`Running migration: ${name}`);
    console.log(`Database: ${DB_CONFIG.database}@${DB_CONFIG.host}:${DB_CONFIG.port}`);

    const sql = readFileSync(sqlPath, 'utf-8');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0 && !statement.startsWith('--'));

    for (const statement of statements) {
      const cleanStatement = statement.replace(/--.*$/gm, '').trim();
      if (cleanStatement.length === 0) {
        continue;
      }

      try {
        await pool.query(cleanStatement);
        console.log(`  OK Executed: ${cleanStatement.substring(0, 80)}...`);
      } catch (error: any) {
        // Ignore duplicate-object errors for idempotent migrations.
        if (error.code === '42P07') {
          console.log(`  SKIP Already exists: ${cleanStatement.substring(0, 60)}...`);
        } else {
          throw error;
        }
      }
    }

    console.log(`OK Migration completed: ${name}`);
  } catch (error: any) {
    console.error(`FAIL Migration failed: ${name}`);
    console.error(`  Error: ${error.message}`);
    throw error;
  } finally {
    await pool.end();
  }
}

async function runAllMigrations(): Promise<void> {
  const migrations = [
    {
      name: 'create-klines-index',
      path: join(__dirname, '..', 'src', 'database', 'migrations', 'create-klines-index.sql'),
    },
  ];

  console.log('='.repeat(60));
  console.log('Database Migration Runner');
  console.log('='.repeat(60));

  for (const migration of migrations) {
    await runMigration(migration.name, migration.path);
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('All migrations completed successfully!');
  console.log('='.repeat(60));
}

runAllMigrations().catch((error) => {
  console.error('Migration runner failed:', error.message);
  process.exit(1);
});
