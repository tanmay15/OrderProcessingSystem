const request = require('supertest');
const app = require('../src/app');
const { orders } = require('../src/models/storeDB');

// Reset the in-memory store before each test to ensure isolation
beforeEach(() => {
  orders.clear();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validOrderPayload = {
  customerId: 'customer-001',
  items: [
    { productId: 'prod-1', name: 'Widget A', quantity: 2, price: 19.99 },
    { productId: 'prod-2', name: 'Gadget B', quantity: 1, price: 49.5 },
  ],
};

async function createTestOrder(payload = validOrderPayload) {
  const res = await request(app).post('/createOrder').send(payload);
  return res.body.order;
}

// ─── POST /createOrder ────────────────────────────────────────────────────────

describe('POST /createOrder', () => {
  it('should create a new order and return 201 with order data', async () => {
    const res = await request(app).post('/createOrder').send(validOrderPayload);

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      customerId: 'customer-001',
      status: 'PENDING',
      totalAmount: 89.48,
    });
    expect(res.body.order.id).toBeDefined();
    expect(res.body.order.items).toHaveLength(2);
    expect(res.body.order.createdAt).toBeDefined();
  });

  it('should return 400 when customerId is missing', async () => {
    const res = await request(app)
      .post('/createOrder')
      .send({ items: validOrderPayload.items });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 when items array is empty', async () => {
    const res = await request(app)
      .post('/createOrder')
      .send({ customerId: 'cust-1', items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 when an item has a negative price', async () => {
    const res = await request(app).post('/createOrder').send({
      customerId: 'cust-1',
      items: [{ productId: 'p1', name: 'Bad Item', quantity: 1, price: -5 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 when an item has zero quantity', async () => {
    const res = await request(app).post('/createOrder').send({
      customerId: 'cust-1',
      items: [{ productId: 'p1', name: 'Bad Item', quantity: 0, price: 10 }],
    });

    expect(res.status).toBe(400);
  });

  it('should correctly calculate total amount', async () => {
    const res = await request(app).post('/createOrder').send({
      customerId: 'cust-calc',
      items: [{ productId: 'p1', name: 'Item', quantity: 3, price: 10.0 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBe(30.0);
  });
});

// ─── GET /getOrder ────────────────────────────────────────────────────────────

describe('GET /getOrder', () => {
  it('should return 400 when neither ?id nor ?ids is provided', async () => {
    const res = await request(app).get('/getOrder');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Provide either');
  });

  describe('single fetch (?id=)', () => {
    it('should retrieve an existing order by ID', async () => {
      const created = await createTestOrder();

      const res = await request(app).get(`/getOrder?id=${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.customerId).toBe('customer-001');
    });

    it('should return 404 for a non-existent order ID', async () => {
      const res = await request(app).get('/getOrder?id=non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('bulk fetch (?ids=)', () => {
    it('should return multiple orders by comma-separated IDs', async () => {
      const o1 = await createTestOrder();
      const o2 = await createTestOrder({ customerId: 'cust-2', items: validOrderPayload.items });

      const res = await request(app).get(`/getOrder?ids=${o1.id},${o2.id}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].order.id).toBe(o1.id);
      expect(res.body.results[1].order.id).toBe(o2.id);
    });

    it('should report a not-found error for missing IDs in the results', async () => {
      const o1 = await createTestOrder();

      const res = await request(app).get(`/getOrder?ids=${o1.id},missing-id`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      const missing = res.body.results.find((r) => r.id === 'missing-id');
      expect(missing.error).toContain('not found');
    });

    it('should return 400 for an empty ?ids value', async () => {
      const res = await request(app).get('/getOrder?ids=');
      expect(res.status).toBe(400);
    });
  });
});

// ─── GET /listOrders ──────────────────────────────────────────────────────────

describe('GET /listOrders', () => {
  it('should return all orders when no filter is applied', async () => {
    await createTestOrder();
    await createTestOrder({ customerId: 'cust-2', items: validOrderPayload.items });

    const res = await request(app).get('/listOrders');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.orders).toHaveLength(2);
  });

  it('should return an empty list when no orders exist', async () => {
    const res = await request(app).get('/listOrders');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.orders).toHaveLength(0);
  });

  it('should filter orders by status', async () => {
    const order = await createTestOrder();
    await request(app)
      .patch(`/updateOrder/${order.id}`)
      .send({ status: 'PROCESSING' });

    await createTestOrder(); // stays PENDING

    const res = await request(app).get('/listOrders?status=PROCESSING');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.orders[0].status).toBe('PROCESSING');
  });

  it('should accept status filter in lowercase', async () => {
    await createTestOrder();

    const res = await request(app).get('/listOrders?status=pending');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('should return 400 for an invalid status filter', async () => {
    const res = await request(app).get('/listOrders?status=UNKNOWN');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid status');
  });
});

// ─── PATCH /updateOrder/:id ───────────────────────────────────────────────────

describe('PATCH /updateOrder/:id', () => {
  it('should update order status to PROCESSING', async () => {
    const order = await createTestOrder();

    const res = await request(app)
      .patch(`/updateOrder/${order.id}`)
      .send({ status: 'PROCESSING' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('PROCESSING');
    expect(res.body.order.updatedAt).not.toBe(order.updatedAt);
  });

  it('should update order through the full lifecycle', async () => {
    const order = await createTestOrder();

    await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'PROCESSING' });
    await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'SHIPPED' });
    const res = await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'DELIVERED' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('DELIVERED');
  });

  it('should return 400 for an invalid status value', async () => {
    const order = await createTestOrder();

    const res = await request(app)
      .patch(`/updateOrder/${order.id}`)
      .send({ status: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 404 for a non-existent order', async () => {
    const res = await request(app)
      .patch('/updateOrder/non-existent-id')
      .send({ status: 'PROCESSING' });

    expect(res.status).toBe(404);
  });

  it('should return 422 when trying to update a CANCELLED order', async () => {
    const order = await createTestOrder();
    await request(app).delete(`/cancelOrder/${order.id}`);

    const res = await request(app)
      .patch(`/updateOrder/${order.id}`)
      .send({ status: 'PROCESSING' });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('cancelled');
  });

  it('should return 422 when trying to update a DELIVERED order', async () => {
    const order = await createTestOrder();
    await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'DELIVERED' });

    const res = await request(app)
      .patch(`/updateOrder/${order.id}`)
      .send({ status: 'SHIPPED' });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('delivered');
  });
});

// ─── DELETE /cancelOrder/:id ──────────────────────────────────────────────────

describe('DELETE /cancelOrder/:id', () => {
  it('should cancel a PENDING order', async () => {
    const order = await createTestOrder();

    const res = await request(app).delete(`/cancelOrder/${order.id}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
    expect(res.body.message).toBe('Order cancelled successfully');
  });

  it('should return 404 for a non-existent order', async () => {
    const res = await request(app).delete('/cancelOrder/does-not-exist');

    expect(res.status).toBe(404);
  });

  it('should return 422 when cancelling a PROCESSING order', async () => {
    const order = await createTestOrder();
    await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'PROCESSING' });

    const res = await request(app).delete(`/cancelOrder/${order.id}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('PROCESSING');
  });

  it('should return 422 when cancelling a SHIPPED order', async () => {
    const order = await createTestOrder();
    await request(app).patch(`/updateOrder/${order.id}`).send({ status: 'SHIPPED' });

    const res = await request(app).delete(`/cancelOrder/${order.id}`);

    expect(res.status).toBe(422);
  });

  it('should return 422 when cancelling an already cancelled order', async () => {
    const order = await createTestOrder();
    await request(app).delete(`/cancelOrder/${order.id}`);

    const res = await request(app).delete(`/cancelOrder/${order.id}`);

    expect(res.status).toBe(422);
  });
});

// ─── Background Job ───────────────────────────────────────────────────────────

describe('Background Job – promotePendingOrders', () => {
  it('should promote all PENDING orders to PROCESSING', () => {
    const { promotePendingOrders, createOrder } = require('../src/services/orderService');

    createOrder('cust-1', [{ productId: 'p1', name: 'Item', quantity: 1, price: 10 }]);
    createOrder('cust-2', [{ productId: 'p2', name: 'Item', quantity: 2, price: 5 }]);

    const count = promotePendingOrders();

    expect(count).toBe(2);
    for (const order of orders.values()) {
      expect(order.status).toBe('PROCESSING');
    }
  });

  it('should not affect already CANCELLED orders', () => {
    const { promotePendingOrders, createOrder, cancelOrder } = require('../src/services/orderService');

    const o1 = createOrder('cust-1', [{ productId: 'p1', name: 'Item', quantity: 1, price: 5 }]);
    cancelOrder(o1.id);

    const o2 = createOrder('cust-2', [{ productId: 'p2', name: 'Item', quantity: 1, price: 5 }]);

    const count = promotePendingOrders();

    expect(count).toBe(1);
    expect(orders.get(o1.id).status).toBe('CANCELLED');
    expect(orders.get(o2.id).status).toBe('PROCESSING');
  });

  it('should return 0 when there are no PENDING orders', () => {
    const { promotePendingOrders } = require('../src/services/orderService');
    const count = promotePendingOrders();
    expect(count).toBe(0);
  });
});
