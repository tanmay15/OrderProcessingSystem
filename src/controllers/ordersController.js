const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const { validateCreateOrder, validateUpdateStatus, validateGetOrderQuery, validateCancelOrderQuery, validateListOrdersQuery } = require('../middleware/validate');

router.post('/createOrder', validateCreateOrder, async (req, res, next) => {
  try {
    console.log(`[createOrder] Request received - customerId: ${req.body.customerId}, items: ${req.body.items.length}`);
    const { customerId, items } = req.body;
    const order = await orderService.createOrder(customerId, items);
    console.log(`[createOrder] Order created - id: ${order.id}`);
    return res.status(201).json({ message: 'Order created successfully', order });
  } catch (err) {
    next(err);
  }
});

router.get('/getOrder', validateGetOrderQuery, async (req, res, next) => {
  try {
    const { id, ids } = req.query;

    // Bulk fetch — ids is already a parsed array after validation
    if (ids) {
      console.log(`[getOrder] Bulk fetch requested - ids: ${ids.join(', ')}`);
      const results = await orderService.getOrdersByIds(ids);
      console.log(`[getOrder] Bulk fetch complete - ${results.length} result(s) returned`);
      return res.json({ total: ids.length, results });
    }

    // Single fetch
    console.log(`[getOrder] Single fetch requested - id: ${id}`);
    const order = await orderService.getOrderById(id);
    if (!order) {
      console.log(`[getOrder] Order not found - id: ${id}`);
      return res.status(404).json({ error: `Order '${id}' not found.` });
    }
    console.log(`[getOrder] Order found - id: ${id}, status: ${order.status}`);
    return res.json(order);
  } catch (err) {
    next(err);
  }
});

router.get('/listOrders', validateListOrdersQuery, async (req, res, next) => {
  try {
    const { status } = req.query;
    console.log(`[listOrders] Request received - status filter: ${status || 'none'}`);
    const result = await orderService.listOrders(status);
    console.log(`[listOrders] ${result.length} order(s) returned`);
    return res.json({ total: result.length, orders: result });
  } catch (err) {
    next(err);
  }
});

router.patch('/updateOrder', validateUpdateStatus, async (req, res, next) => {
  try {
    const { id, status } = req.body;
    console.log(`[updateOrder] Request received - id: ${id}, new status: ${status}`);
    const order = await orderService.updateOrderStatus(id, status);
    if (!order) {
      console.log(`[updateOrder] Order not found - id: ${id}`);
      return res.status(404).json({ error: `Order '${id}' not found.` });
    }
    console.log(`[updateOrder] Status updated - id: ${id}, status: ${order.status}`);
    return res.json({ message: 'Order status updated successfully', order });
  } catch (err) {
    err.status = 422;
    next(err);
  }
});

router.delete('/cancelOrder', validateCancelOrderQuery, async (req, res, next) => {
  try {
    const { id } = req.query;
    console.log(`[cancelOrder] Request received - id: ${id}`);
    const order = await orderService.cancelOrder(id);
    if (!order) {
      console.log(`[cancelOrder] Order not found - id: ${id}`);
      return res.status(404).json({ error: `Order '${id}' not found.` });
    }
    console.log(`[cancelOrder] Order cancelled - id: ${id}`);
    return res.json({ message: 'Order cancelled successfully', order });
  } catch (err) {
    err.status = 422;
    next(err);
  }
});

module.exports = router;
