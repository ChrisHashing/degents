const express = require('express');
const router = express.Router();
const { addToMintQueue } = require('../utils/queue');

router.post('/', async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ success: false, message: 'Wallet address is required' });
  }

  try {
    const queueResponse = await addToMintQueue(walletAddress);
    res.status(200).json({ success: true, ...queueResponse });
  } catch (error) {
    console.error('Error adding to mint queue:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
