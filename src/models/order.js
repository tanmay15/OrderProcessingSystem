const { v4: uuidv4 } = require('uuid');

const ORDER_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/**
 * Creates a new order object.
 * @param {string} customerId
 * @param {Array<{productId: string, name: string, quantity: number, price: number}>} items
 * @returns {Object} order
 */
function createOrderObject(customerId, items) {
  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  return {
    id: uuidv4(),
    customerId,
    items,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    status: ORDER_STATUS.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { createOrderObject, ORDER_STATUS };
