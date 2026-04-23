# AGENTS.md — Project Context for AI Agents

## What this project is

A RESTful Order Processing System backend built with **Express.js** and **PostgreSQL (NeonDB)**. It is a take-home assignment for a software engineer role. The codebase should be intentionally simple and production-aware (layered architecture, dedicated worker, Docker support).

---

## Folder structure

```
src/
├── app.js                          # Express bootstrap, Swagger UI at /api-docs
├── controllers/ordersController.js # Route definitions + HTTP layer (routes and controller merged)
├── services/orderService.js        # Business logic layer
├── repositories/orderRepository.js # All SQL queries — only file that touches the DB
├── middleware/
│   ├── validate.js                 # Joi schemas + validateBody / validateQuery middlewares
│   └── errorHandler.js             # Global error handler (last middleware in app.js)
├── models/order.js                 # createOrderObject() factory + ORDER_STATUS enum
├── db/db.js                        # pg connection pool (reads DATABASE_URL from .env)
├── workers/orderStatusUpdateCron.js# Standalone cron worker — run separately, never imported by app.js
└── swagger.js                      # OpenAPI 3.0 spec

tests/
└── orders.test.js                  # Jest + Supertest integration tests (uses .env.test DB)
```

---

## API endpoints

| Method   | Path           | Body / Query              | Description                          |
|----------|----------------|---------------------------|--------------------------------------|
| `POST`   | `/createOrder` | body: `{ customerId, items[] }` | Creates a new order             |
| `GET`    | `/getOrder`    | query: `?id=` or `?ids=`  | Fetch one order or bulk by IDs       |
| `GET`    | `/listOrders`  | query: `?status=` (optional) | List all orders, optional filter  |
| `PATCH`  | `/updateOrder` | body: `{ id, status }`    | Update status to any valid value     |
| `DELETE` | `/cancelOrder` | query: `?id=`             | Cancel an order (PENDING only)       |

---

## Business rules

- Valid statuses: `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`
- `PATCH /updateOrder` — no transition restrictions; any status can be set to any other status
- `DELETE /cancelOrder` — only `PENDING` orders can be cancelled; throws `422` otherwise
- Background worker (`orderStatusUpdateCron.js`) promotes all `PENDING` → `PROCESSING` every 5 minutes via cron

---

## Key constraints to preserve

- `orderRepository.js` is the **only** file that runs SQL. Services must not call `db.js` directly.
- `app.js` must remain free of any cron job logic. The worker runs as a separate process (`npm run worker`).
- Input validation lives entirely in `validate.js` using Joi. Controllers must not contain validation logic.
- Tests use `.env.test` (separate test database). Never point tests at the production DB.
- `ORDER_STATUSES` in `validate.js` (line 3) is the single source of truth for valid status values — update here first if statuses change.

---

## Environment

| File        | Purpose                          |
|-------------|----------------------------------|
| `.env`      | Production DB connection string  |
| `.env.test` | Test DB connection string        |

Both are git-ignored. The app reads `DATABASE_URL` and optionally `PORT` (default `3000`).

---

## Running

```bash
npm start          # API server
npm run worker     # Background cron worker (separate process)
npm test           # Jest integration tests
docker compose up --build  # Both API + worker in Docker
```
