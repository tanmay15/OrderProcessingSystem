const { createOrderObject, ORDER_STATUS } = require('../models/order');
const repo = require('../repositories/orderRepository');


async function createOrder(customerId, items) {
  const order = createOrderObject(customerId, items);
  await repo.insertOrder(order);
  return order;
}

/* Fetch a single order by ID. Returns null when not found. */
async function getOrderById(orderId) {
  return repo.findOrderById(orderId);
}

/*Fetch multiple orders by an array of IDs. Returns an array of { id, order | error } results — one entry per requested ID.*/
async function getOrdersByIds(ids) {
  const orderMap = await repo.findOrdersByIds(ids);
  return ids.map((id) => {
    const order = orderMap.get(id);
    return order ? { id, order } : { id, error: `Order '${id}' not found.` };
  });
}

/* List all orders, with an optional status filter. */
async function listOrders(status) {
  return repo.findAllOrders(status);
}

/* Update an order's status. Returns the updated order, or null if not found. */
async function updateOrderStatus(orderId, newStatus) {
  const current = await repo.findOrderById(orderId);
  if (!current) return null;

  return repo.updateOrderStatus(orderId, newStatus.toUpperCase());
}

/* Cancel an order. Only PENDING orders may be cancelled. Returns the updated order, or null if not found. */
async function cancelOrder(orderId) {
  const current = await repo.findOrderById(orderId);
  if (!current) return null;

  if (current.status !== ORDER_STATUS.PENDING) {
    throw new Error(
      `Order cannot be cancelled. Current status: ${current.status}. Only PENDING orders can be cancelled.`
    );
  }

  return repo.updateOrderStatus(orderId, ORDER_STATUS.CANCELLED);
}

/* Promote all PENDING orders to PROCESSING. Called by the background job every 5 minutes. Returns the number of orders updated. */
async function promotePendingOrders() {
  return repo.promotePendingOrders();
}

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByIds,
  listOrders,
  updateOrderStatus,
  cancelOrder,
  promotePendingOrders,
};
