const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Order Processing System',
    version: '1.0.0',
    description:
      'REST API for an E-commerce Order Processing System. Customers can place orders, track status, and cancel orders. A background worker automatically promotes PENDING orders to PROCESSING every 5 minutes.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development server' },
  ],

  // ─── Reusable schemas ────────────────────────────────────────────────────────
  components: {
    schemas: {
      OrderItem: {
        type: 'object',
        required: ['productId', 'name', 'quantity', 'price'],
        properties: {
          productId: { type: 'string', example: 'prod-1' },
          name:      { type: 'string', example: 'Widget A' },
          quantity:  { type: 'integer', minimum: 1, example: 2 },
          price:     { type: 'number', format: 'float', example: 19.99 },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
          customerId:  { type: 'string', example: 'customer-001' },
          totalAmount: { type: 'number', example: 89.48 },
          status: {
            type: 'string',
            enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
            example: 'PENDING',
          },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/OrderItem' },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          error:   { type: 'string', example: 'Validation failed' },
          details: { type: 'array', items: { type: 'string' }, example: ['"customerId" is required'] },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Order \'abc\' not found.' },
        },
      },
    },
  },

  // ─── Endpoints ───────────────────────────────────────────────────────────────
  paths: {

    '/createOrder': {
      post: {
        summary: 'Place a new order',
        tags: ['Orders'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customerId', 'items'],
                properties: {
                  customerId: { type: 'string', example: 'customer-001' },
                  items: {
                    type: 'array',
                    minItems: 1,
                    items: { $ref: '#/components/schemas/OrderItem' },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Order created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Order created successfully' },
                    order:   { $ref: '#/components/schemas/Order' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
        },
      },
    },

    '/getOrder': {
      get: {
        summary: 'Fetch one or multiple orders by ID',
        tags: ['Orders'],
        parameters: [
          {
            name: 'id',
            in: 'query',
            description: 'Single order UUID',
            schema: { type: 'string', format: 'uuid' },
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          {
            name: 'ids',
            in: 'query',
            description: 'Comma-separated list of order UUIDs for bulk fetch',
            schema: { type: 'string' },
            example: 'uuid-1,uuid-2,uuid-3',
          },
        ],
        responses: {
          200: {
            description: 'Order(s) returned',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/Order' },
                    {
                      type: 'object',
                      properties: {
                        total:   { type: 'integer' },
                        results: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id:    { type: 'string', format: 'uuid' },
                              order: { $ref: '#/components/schemas/Order' },
                              error: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { description: 'Missing or invalid ID param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          404: { description: 'Order not found',            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/listOrders': {
      get: {
        summary: 'List all orders, optionally filtered by status',
        tags: ['Orders'],
        parameters: [
          {
            name: 'status',
            in: 'query',
            description: 'Filter by order status (case-insensitive)',
            schema: {
              type: 'string',
              enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
            },
          },
        ],
        responses: {
          200: {
            description: 'List of orders',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total:  { type: 'integer', example: 3 },
                    orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid status filter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
        },
      },
    },

    '/updateOrder': {
      patch: {
        summary: 'Update the status of an order',
        tags: ['Orders'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'status'],
                properties: {
                  id:     { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
                  status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], example: 'SHIPPED' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Status updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Order status updated successfully' },
                    order:   { $ref: '#/components/schemas/Order' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          404: { description: 'Order not found',  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/cancelOrder': {
      delete: {
        summary: 'Cancel an order (only PENDING orders can be cancelled)',
        tags: ['Orders'],
        parameters: [
          {
            name: 'id',
            in: 'query',
            required: true,
            description: 'UUID of the order to cancel',
            schema: { type: 'string', format: 'uuid' },
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
        ],
        responses: {
          200: {
            description: 'Order cancelled',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Order cancelled successfully' },
                    order:   { $ref: '#/components/schemas/Order' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing or invalid ID',          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          404: { description: 'Order not found',                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Order is not in PENDING status', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

  },
};

module.exports = swaggerSpec;
