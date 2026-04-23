# Order Processing System

A RESTful backend for an E-commerce Order Processing System built with **Express.js** and **PostgreSQL**.

---

## Table of Contents

- [Overview](#overview)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Schema](#database-schema)
- [Running the Server](#running-the-server)
- [Running the Background Worker](#running-the-background-worker)
- [Running with Docker](#running-with-docker)
- [Running Tests](#running-tests)
- [Swagger UI](#swagger-ui)
- [API Reference](#api-reference)

---

## Overview

Customers can place orders containing multiple items. Each order moves through a status lifecycle:

```
PENDING ──► PROCESSING ──► SHIPPED ──► DELIVERED
   │
   └──► CANCELLED  (only allowed from PENDING)
```

A background cron job runs every 5 minutes and automatically promotes all `PENDING` orders to `PROCESSING`, simulating an order fulfilment pipeline picking up new orders.

---

## Folder Structure

```
src/
├── app.js                        # Express app bootstrap + server entry point
├── controllers/
│   └── ordersController.js       # Route definitions + request/response handlers
├── services/
│   └── orderService.js           # Business logic (rules, orchestration)
├── repositories/
│   └── orderRepository.js        # All SQL queries against PostgreSQL
├── models/
│   └── order.js                  # Order factory function + ORDER_STATUS enum
├── middleware/
│   ├── validate.js               # Joi input validation middleware for all endpoints
│   └── errorHandler.js           # Global Express error handler
├── workers/
│   └── orderStatusUpdateCron.js  # Dedicated background worker process (run separately)
└── db/
    └── db.js                     # pg connection pool

tests/
├── setup.js                      # Loads .env.test before any module is required
└── orders.test.js                # Jest + Supertest integration tests
```

### How a request flows

```
HTTP Request
  → validate.js        (rejects bad input before it reaches the handler)
  → ordersController   (reads request, calls service, sends response)
  → orderService       (enforces business rules)
  → orderRepository    (executes SQL)
  → PostgreSQL
```

---

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A PostgreSQL database (the project uses [Neon](https://neon.tech) serverless Postgres)

---

## Environment Setup

Both `.env` and `.env.test` are **committed to this repository** so the reviewer can run the project immediately with no additional setup. The databases are hosted on [Neon](https://neon.tech) serverless Postgres and are already live.

> In a real production repository these files would be git-ignored and secrets would be managed via a secrets manager (e.g. AWS Secrets Manager) or CI/CD environment variables.

If you ever need to point the project at your own databases, the format is:

```env
# .env  (API server + worker)
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=verify-full
PORT=3000
```

```env
# .env.test  (Jest integration tests — use a separate DB so test data never touches production)
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=verify-full
PORT=3000
```

---

## Database Schema

Run the following SQL on **both** your production and test databases before starting the server or running tests:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE orders (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   VARCHAR(255)  NOT NULL,
  total_amount  DECIMAL(10,2) NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  VARCHAR(255)  NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  quantity    INTEGER       NOT NULL CHECK (quantity > 0),
  price       DECIMAL(10,2) NOT NULL CHECK (price > 0)
);

CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_customer_id  ON orders(customer_id);
CREATE INDEX idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

---

## Running the Server

```bash
# Install dependencies
npm install

# Development mode (auto-restarts on file changes)
npm run dev

# Production mode
npm start
```

Server starts at **http://localhost:3000** by default. Override with `PORT=8080 npm start`.

> The API server has **no background job built in**. The cron job runs as a separate process — see below.

---

## Running the Background Worker

The background worker is a **dedicated process** that runs independently of the API server. It promotes all `PENDING` orders to `PROCESSING` every 5 minutes.

```bash
npm run worker
```

In production, run the API server and the worker as two separate processes (or containers) from the same codebase:

```bash
# Process / Container 1 — API (can be scaled horizontally)
npm start

# Process / Container 2 — Worker (always exactly 1 instance)
npm run worker
```

The worker verifies the DB connection on startup and handles graceful shutdown on `SIGTERM` / `SIGINT`:

```
[Worker] Order Status Update Worker starting...
[Worker] Database connection verified.
[Worker] Cron job scheduled — runs every 5 minutes.
[Worker] Worker is running. Press Ctrl+C to stop.

[Worker] Job started at 2026-04-22T10:05:00.000Z
[Worker] Promoted 3 PENDING order(s) to PROCESSING.
```

> **Note:** If the worker is not running, orders will remain in `PENDING` status indefinitely. Make sure it is always running alongside the API in any environment.

---

## Running with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) to be running.

Both the API and the worker share the same image. The `docker-compose.yml` spins them up as two separate containers, each reading the same `.env` file for the database connection string.

```bash
# Build the image and start both containers
docker compose up --build

# Run in detached (background) mode
docker compose up --build -d

# Stop and remove containers
docker compose down
```

| Container | Command | Port |
|-----------|---------|------|
| `api`     | `node src/app.js` | `3000` |
| `worker`  | `node src/workers/orderStatusUpdateCron.js` | — |

> The `.env` file must exist locally before running — it is intentionally excluded from the Docker image (`.dockerignore`) so secrets are never baked in.

---

## Running Tests

Tests run against the **test database** defined in `.env.test` — production data is never touched.  
Each test wipes the `orders` table before running so every test starts with a clean slate.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

---

## Swagger UI

An interactive API explorer is available once the server is running.

| Mode | URL |
|------|-----|
| Local / npm | http://localhost:3000/api-docs |
| Docker | http://localhost:3000/api-docs |

Open it in a browser to browse all endpoints, see request/response schemas, and execute live requests directly from the UI — no Postman or curl required.

---

## API Reference

### POST /createOrder

Place a new order. Status defaults to `PENDING`.

**Request body:**
```json
{
  "customerId": "customer-001",
  "items": [
    { "productId": "prod-1", "name": "Widget A", "quantity": 2, "price": 19.99 },
    { "productId": "prod-2", "name": "Gadget B", "quantity": 1, "price": 49.50 }
  ]
}
```

**curl:**
```bash
curl -X POST http://localhost:3000/createOrder \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"customer-001\", \"items\": [{\"productId\": \"prod-1\", \"name\": \"Widget A\", \"quantity\": 2, \"price\": 19.99}, {\"productId\": \"prod-2\", \"name\": \"Gadget B\", \"quantity\": 1, \"price\": 49.50}]}"
```

**Response `201`:**
```json
{
  "message": "Order created successfully",
  "order": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customerId": "customer-001",
    "items": [...],
    "totalAmount": 89.48,
    "status": "PENDING",
    "createdAt": "2026-04-22T10:00:00.000Z",
    "updatedAt": "2026-04-22T10:00:00.000Z"
  }
}
```

---

### GET /getOrder

Fetch one or multiple orders by ID.

**Single order — curl:**
```bash
curl -X GET "http://localhost:3000/getOrder?id=550e8400-e29b-41d4-a716-446655440000"
```

**Multiple orders — curl:**
```bash
curl -X GET "http://localhost:3000/getOrder?ids=id-one,id-two,id-three"
```

**Bulk response:**
```json
{
  "total": 2,
  "results": [
    { "id": "id-one", "order": { ... } },
    { "id": "id-two", "error": "Order 'id-two' not found." }
  ]
}
```

---

### GET /listOrders

List all orders. Optionally filter by status.

**curl — all orders:**
```bash
curl -X GET http://localhost:3000/listOrders
```

**curl — filtered by status:**
```bash
curl -X GET "http://localhost:3000/listOrders?status=PENDING"
```

Valid status values: `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`  
The filter is case-insensitive (`pending` works the same as `PENDING`).

**Response `200`:**
```json
{
  "total": 3,
  "orders": [...]
}
```

---

### PATCH /updateOrder

Update the status of an order. Both `id` and `status` are passed in the request body.

**curl:**
```bash
curl -X PATCH http://localhost:3000/updateOrder \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"550e8400-e29b-41d4-a716-446655440000\", \"status\": \"SHIPPED\"}"
```

Valid status values: `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`  
No transition restrictions — any status can be set to any other status via this endpoint.

**Response `200`:**
```json
{
  "message": "Order status updated successfully",
  "order": { "status": "SHIPPED", ... }
}
```

---

### DELETE /cancelOrder

Cancel an order. Only orders in `PENDING` status can be cancelled.

**curl:**
```bash
curl -X DELETE "http://localhost:3000/cancelOrder?id=550e8400-e29b-41d4-a716-446655440000"
```

**Response `200`:**
```json
{
  "message": "Order cancelled successfully",
  "order": { "status": "CANCELLED", ... }
}
```

**Response `422`** if the order is not `PENDING`:
```json
{
  "error": "Order cannot be cancelled. Current status: PROCESSING. Only PENDING orders can be cancelled."
}
```

---

## Error Responses

All errors follow a consistent shape:

```json
{ "error": "Human-readable message" }
```

Validation errors include a `details` array:

```json
{
  "error": "Validation failed",
  "details": ["\"customerId\" is required", "\"items\" must contain at least 1 items"]
}
```

| HTTP Status | Meaning |
|---|---|
| `400` | Invalid input — missing field, wrong type, bad UUID, invalid status |
| `404` | Order not found |
| `422` | Business rule violation — e.g. cancelling a non-PENDING order |
| `500` | Unexpected server error |

