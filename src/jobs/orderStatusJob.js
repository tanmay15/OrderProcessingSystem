const cron = require('node-cron');
const { promotePendingOrders } = require('../services/orderService');

/* Background job: every 5 minutes, automatically promote all PENDING orders to PROCESSING status. Cron expression: every 5th minute (minute-step 5). */
function startOrderStatusJob() {
  const task = cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await promotePendingOrders();
      if (count > 0) {
        console.log(
          `[Job] ${new Date().toISOString()} – Promoted ${count} PENDING order(s) to PROCESSING.`
        );
      } else {
        console.log(
          `[Job] ${new Date().toISOString()} – No PENDING orders to promote.`
        );
      }
    } catch (err) {
      console.error(`[Job] Error promoting orders:`, err.message);
    }
  });

  console.log('[Job] Order status background job started (runs every 5 minutes).');
  return task;
}

module.exports = { startOrderStatusJob };
