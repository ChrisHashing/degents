const express = require('express');
const cors = require('cors');
const path = require('path');

const { monitorMints } = require('./utils/monitorChain');
const { startScan } = require('./utils/scanOnChain');
const { recoverQueuedJobs } = require('./utils/integrityWorker');

const mintRoute = require('./routes/mint');
const nftRoute = require('./routes/nfts');

const app = express();
app.use(cors());
app.use(express.json());

// Static file serving
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/metadata', express.static(path.join(__dirname, 'metadata')));

// Health check
app.get('/health', (req, res) => res.send('✅ OK'));

// API routes
app.use('/mint', mintRoute);
app.use('/nfts', nftRoute);

// Server start function
async function startServer() {
  monitorMints();
  startScan();
  await recoverQueuedJobs(); // Recover QUEUED tokens after restart

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
