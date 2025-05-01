
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { readStatusFile } = require('../utils/status');

router.get('/:walletAddress', (req, res) => {
  const wallet = req.params.walletAddress.toLowerCase();
  const statusData = readStatusFile();

  const results = Object.entries(statusData)
    .filter(([_, entry]) => entry.wallet?.toLowerCase() === wallet && entry.status === 'COMPLETED')
    .map(([tokenId]) => {
      const metadataPath = path.join(__dirname, '..', 'metadata', `${tokenId}.json`);
      let metadata = null;

      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (err) {
        console.error(`Missing or invalid metadata for Token ID ${tokenId}`);
      }

      return {
        tokenId,
        image: `/images/${tokenId}.png`,
        metadata
      };
    })
    .filter(item => item.metadata !== null);

  res.json(results);
});

module.exports = router;
