const Joi = require('joi');

const ORDER_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

// ─── Schemas
const itemSchema = Joi.object({
  productId: Joi.string().trim().min(1).required(),
  name: Joi.string().trim().min(1).required(),
  quantity: Joi.number().integer().min(1).required(),
  price: Joi.number().positive().precision(2).required(),
});

const createOrderSchema = Joi.object({
  customerId: Joi.string().trim().min(1).required(),
  items: Joi.array().items(itemSchema).min(1).required(),
});

const updateStatusSchema = Joi.object({
  id: Joi.string().uuid().required(),
  status: Joi.string().uppercase().valid(...ORDER_STATUSES).required(),
});

// Validates ?id= (single UUID) or ?ids= (comma-separated UUIDs).
// For ?ids=, the custom validator also splits the string into an array,
// so req.query.ids arrives in the route already parsed — no split needed there.
const getOrderQuerySchema = Joi.object({
  id: Joi.string().uuid().optional(),
  ids: Joi.string()
    .optional()
    .custom((value, helpers) => {
      const list = value.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) {
        return helpers.error('any.invalid');
      }
      const invalidIds = list.filter((s) => Joi.string().uuid().validate(s).error);
      if (invalidIds.length) {
        return helpers.message(`Invalid UUID(s) in ?ids: ${invalidIds.join(', ')}`);
      }
      return list; // coerce string → array for the route handler
    }),
}).or('id', 'ids').messages({
  'object.missing': 'Provide either ?id=<orderId> for a single order or ?ids=<id1>,<id2>,... for multiple.',
});

const cancelOrderQuerySchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    'any.required': 'Provide ?id=<orderId> as a query parameter.',
    'string.guid': 'Invalid UUID format for ?id.',
  }),
});

const listOrdersQuerySchema = Joi.object({
  status: Joi.string()
    .uppercase()
    .valid(...ORDER_STATUSES)
    .optional(),
});


// ─── Middlewares
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }
    req.query = value;
    next();
  };
}

module.exports = {
  validateCreateOrder: validateBody(createOrderSchema),
  validateUpdateStatus: validateBody(updateStatusSchema),
  validateGetOrderQuery: validateQuery(getOrderQuerySchema),
  validateCancelOrderQuery: validateQuery(cancelOrderQuerySchema),
  validateListOrdersQuery: validateQuery(listOrdersQuerySchema),
};
