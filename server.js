const express = require('express');
const config = require('./src/config');
const { DB, setDb } = require('./src/db');
const storeRoutes = require('./src/routes/store');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const paymentsRoutes = require('./src/routes/payments');

async function main() {
  let db;
  try {
    db = new DB();
    await db.init();
    setDb(db);
  } catch (e) {
    console.error('='.repeat(52));
    console.error('ERROR starting the database:');
    console.error(' ', e.message || e);
    console.error('  - Using SQLite? Remove DB_DRIVER=mysql from .env or');
    console.error('    make sure your MySQL server is running.');
    console.error('='.repeat(52));
    process.exit(1);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api', storeRoutes);
  app.use('/api', authRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', paymentsRoutes);

  app.use(express.static(config.PUBLIC_DIR, { maxAge: '1h' }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(404).json({ error: 'File not found' });
  });

  app.use((err, req, res, next) => {
    console.error('[error]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });

  const argPort = process.argv[2] ? Number(process.argv[2]) : NaN;
  const port = Number.isInteger(argPort) ? argPort : config.port;
  const host = config.host;

  const server = app.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    console.log('='.repeat(52));
    console.log('  Sudha Wellness - E-Commerce Store');
    console.log(`  Database  : ${db.driver === 'mysql' ? 'MySQL' : 'SQLite'}`);
    console.log(`  Storefront : http://${displayHost}:${port}/`);
    console.log(`  Admin panel: http://${displayHost}:${port}/admin.html`);
    console.log('  Press Ctrl+C to stop');
    console.log('='.repeat(52));
  });

  const shutdown = () => {
    console.log('\nStopping server...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});