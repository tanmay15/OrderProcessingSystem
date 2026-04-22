const pool = require('../db/db');


function rowsToOrderMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        customerId: row.customer_id,
        totalAmount: parseFloat(row.total_amount),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items: [],
      });
    }
    if (row.item_id) {
      map.get(row.id).items.push({
        productId: row.product_id,
        name: row.item_name,
        quantity: row.quantity,
        price: parseFloat(row.price),
      });
    }
  }
  return map;
}

/* Base SELECT used by all fetch queries */
const ORDER_SELECT = `
  SELECT
    o.id, o.customer_id, o.total_amount, o.status, o.created_at, o.updated_at,
    oi.id         AS item_id,
    oi.product_id,
    oi.name       AS item_name,
    oi.quantity,
    oi.price
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;

/**
 * Inserts a new order and its items inside a single transaction.
 * @param {{ id, customerId, items, totalAmount, status, createdAt, updatedAt }} order
 */
async function insertOrder(order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, order.customerId, order.totalAmount, order.status, order.createdAt, order.updatedAt]
    );

    for (const item of order.items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.name, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findOrderById(orderId) {
  const { rows } = await pool.query(
    ORDER_SELECT + ` WHERE o.id = $1 ORDER BY oi.id`,
    [orderId]
  );
  const map = rowsToOrderMap(rows);
  return map.get(orderId) || null;
}


async function findOrdersByIds(ids) {
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    ORDER_SELECT + ` WHERE o.id IN (${placeholders}) ORDER BY o.created_at, oi.id`,
    ids
  );
  return rowsToOrderMap(rows);
}

async function findAllOrders(status) {
  let query = ORDER_SELECT;
  const params = [];

  if (status) {
    params.push(status.toUpperCase());
    query += ` WHERE o.status = $1`;
  }

  query += ` ORDER BY o.created_at DESC, oi.id`;

  const { rows } = await pool.query(query, params);
  return Array.from(rowsToOrderMap(rows).values());
}


async function updateOrderStatus(orderId, newStatus) {
  const { rows } = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [newStatus, orderId]
  );
  if (!rows.length) return null;
  return findOrderById(orderId);
}


async function promotePendingOrders() {
  const { rowCount } = await pool.query(
    `UPDATE orders SET status = 'PROCESSING', updated_at = NOW()
     WHERE status = 'PENDING'`
  );
  return rowCount;
}

module.exports = {
  insertOrder,
  findOrderById,
  findOrdersByIds,
  findAllOrders,
  updateOrderStatus,
  promotePendingOrders,
};
