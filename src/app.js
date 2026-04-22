require('dotenv').config();
const express = require('express');
const orderRoutes = require('./controllers/ordersController');
const errorHandler = require('./middleware/errorHandler');
const { startOrderStatusJob } = require('./jobs/orderStatusJob');

const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Routes – Business logic
app.use('/', orderRoutes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start background job only when this file is run directly (not during tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startOrderStatusJob();
  });
}

module.exports = app;
