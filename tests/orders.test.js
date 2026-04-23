const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/db'); //Use different DB for testing

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

// Wipe all orders before each test so every test starts with a clean slate.
// DELETE on orders cascades to order_items via the FK constraint.
beforeEach(async () => {
  await pool.query('DELETE FROM orders');
});

// Close the pg connection pool after all tests so Jest can exit cleanly.
afterAll(async () => {
  await pool.end();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const validPayload = {
  customerId: 'test-customer',
  items: [
    { productId: 'p1', name: 'Widget A', quantity: 2, price: 10.00 },
    { productId: 'p2', name: 'Gadget B', quantity: 1, price: 25.50 },
  ],
};

async function createOrder(payload = validPayload) {
  const res = await request(app).post('/createOrder').send(payload);
  return res.body.order;
}

// ─── 1. Create Order ──────────────────────────────────────────────────────────

describe('POST /createOrder', () => {
  test('valid request → 201 with order data', async () => {
    const res = await request(app).post('/createOrder').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      customerId: 'test-customer',
      status: 'PENDING',
      totalAmount: 45.50,
    });
    expect(res.body.order.id).toBeDefined();
    expect(res.body.order.items).toHaveLength(2);
  });

  test('empty items array → 400', async () => {
    const res = await request(app)
      .post('/createOrder')
      .send({ customerId: 'cust-1', items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('invalid quantity (zero) → 400', async () => {
    const res = await request(app).post('/createOrder').send({
      customerId: 'cust-1',
      items: [{ productId: 'p1', name: 'Widget', quantity: 0, price: 10.00 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('missing customerId → 400', async () => {
    const res = await request(app)
      .post('/createOrder')
      .send({ items: validPayload.items });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

// ─── 2. Get Order ─────────────────────────────────────────────────────────────

describe('GET /getOrder', () => {
  test('valid ID → returns order', async () => {
    const created = await createOrder();

    const res = await request(app).get(`/getOrder?id=${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.customerId).toBe('test-customer');
  });

  test('non-existent ID → 404', async () => {
    const res = await request(app).get('/getOrder?id=00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  test('invalid UUID format → 400', async () => {
    const res = await request(app).get('/getOrder?id=not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('no id or ids param → 400', async () => {
    const res = await request(app).get('/getOrder');

    expect(res.status).toBe(400);
  });
});

// ─── 3. Update Status ─────────────────────────────────────────────────────────

describe('PATCH /updateOrder', () => {
  test('valid order → status updated successfully', async () => {
    const order = await createOrder();

    const res = await request(app)
      .patch('/updateOrder')
      .send({ id: order.id, status: 'PROCESSING' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('PROCESSING');
  });

  test('non-existent ID → 404', async () => {
    const res = await request(app)
      .patch('/updateOrder')
      .send({ id: '00000000-0000-0000-0000-000000000000', status: 'PROCESSING' });

    expect(res.status).toBe(404);
  });

  test('status can be set to CANCELLED via updateOrder', async () => {
    const order = await createOrder();

    const res = await request(app)
      .patch('/updateOrder')
      .send({ id: order.id, status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
  });

  test('invalid status value → 400', async () => {
    const order = await createOrder();

    const res = await request(app)
      .patch('/updateOrder')
      .send({ id: order.id, status: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

});

// ─── 4. Cancel Order ──────────────────────────────────────────────────────────

describe('DELETE /cancelOrder', () => {
  test('PENDING order → cancelled successfully', async () => {
    const order = await createOrder();

    const res = await request(app).delete(`/cancelOrder?id=${order.id}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
  });

  test('PROCESSING order → 422 cannot cancel', async () => {
    const order = await createOrder();
    await request(app).patch('/updateOrder').send({ id: order.id, status: 'PROCESSING' });

    const res = await request(app).delete(`/cancelOrder?id=${order.id}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('PROCESSING');
  });

  test('non-existent ID → 404', async () => {
    const res = await request(app).delete('/cancelOrder?id=00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
  });

  test('missing id param → 400', async () => {
    const res = await request(app).delete('/cancelOrder');

    expect(res.status).toBe(400);
  });
});

// ─── 5. List Orders ───────────────────────────────────────────────────────────

describe('GET /listOrders', () => {
  test('no filter → returns all orders', async () => {
    await createOrder();
    await createOrder();

    const res = await request(app).get('/listOrders');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.orders).toHaveLength(2);
  });

  test('with status filter → returns only matching orders', async () => {
    const order = await createOrder();
    await createOrder(); // stays PENDING

    await request(app).patch('/updateOrder').send({ id: order.id, status: 'SHIPPED' });

    const res = await request(app).get('/listOrders?status=SHIPPED');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.orders[0].status).toBe('SHIPPED');
  });

  test('status filter is case-insensitive', async () => {
    await createOrder();

    const res = await request(app).get('/listOrders?status=pending');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('invalid status filter → 400', async () => {
    const res = await request(app).get('/listOrders?status=INVALID');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('empty DB → returns empty list', async () => {
    const res = await request(app).get('/listOrders');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
