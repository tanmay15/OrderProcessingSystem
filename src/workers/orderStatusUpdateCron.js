/**
 * Dedicated Worker Process — Order Status Updater
 *
 * Run independently of the API server:
 *   node src/workers/orderStatusUpdateCron.js
 *   (or via: npm run worker)
 *
 * This process has one job: every 5 minutes, promote all PENDING orders
 * to PROCESSING. It is intentionally a standalone script.
 *
 */

require('dotenv').config();

const cron = require('node-cron');
const { promotePendingOrders } = require('../services/orderService');
const pool = require('../db/db');

async function checkDbConnection() {
  try {
    await pool.query('SELECT 1');
    console.log('[Worker] Database connection verified.');
  } catch (err) {
    console.error('[Worker] Could not connect to database:', err.message);
    process.exit(1);
  }
}

async function runJob() {
  const startedAt = new Date().toISOString();
  console.log(`[Worker] Job started at ${startedAt}`);

  try {
    const count = await promotePendingOrders();
    if (count > 0) {
      console.log(`[Worker] Promoted ${count} PENDING order(s) to PROCESSING.`);
    } else {
      console.log('[Worker] No PENDING orders to promote.');
    }
  } catch (err) {
    console.error('[Worker] Job failed:', err.message);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// When the process receives SIGTERM (e.g. Docker stop, Kubernetes pod eviction)
// or SIGINT (Ctrl+C), stop the cron task and close the DB pool cleanly before
// exiting. This avoids leaving open connections in the pool.

function shutdown(task) {
  return async (signal) => {
    console.log(`[Worker] Received ${signal}. Shutting down gracefully...`);
    task.stop();
    await pool.end();
    console.log('[Worker] DB pool closed. Exiting.');
    process.exit(0);
  };
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function start() {
  console.log('[Worker] Order Status Update Worker starting...');

  await checkDbConnection();

  // Schedule: every 5 minutes
  const task = cron.schedule('*/5 * * * *', runJob);

  console.log('[Worker] Cron job scheduled — runs every 5 minutes.');
  console.log('[Worker] Worker is running. Press Ctrl+C to stop.\n');

  // Register shutdown handlers
  process.on('SIGTERM', shutdown(task));
  process.on('SIGINT', shutdown(task));
}

start();
