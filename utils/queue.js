const { sendToKieAI, pollKieAITask, isPaused } = require('./kieai');
const { downloadImage } = require('./downloadImage');
const { updateStatus, readStatusFile } = require('./status');
const prompts = require('../prompt.json');
const sharp = require('sharp');
const fs = require('fs');

const MAX_CONCURRENT_MINTS = 5;
const MAX_RETRIES = 5;
let activeWorkers = 0;
let mintQueue = [];
let retryQueue = [];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilFileReady(path, maxTries = 5, interval = 300) {
  while (maxTries--) {
    if (fs.existsSync(path) && fs.statSync(path).size > 10000) {
      return true;
    }
    await delay(interval);
  }
  return false;
}

async function validateImageSize(path) {
  const ready = await waitUntilFileReady(path);
  if (!ready) {
    console.warn("🛑 Image not ready or too small");
    return false;
  }

  try {
    const metadata = await sharp(path).metadata();
    const isValid = metadata.width === 1024 && metadata.height === 1024;
    if (!isValid) {
      console.warn(`📐 Invalid image size: ${metadata.width}x${metadata.height}`);
    }
    return isValid;
  } catch (err) {
    console.error("🛑 Sharp failed to read image:", err.message);
    return false;
  }
}

async function processMint({ walletAddress, tokenId, retryCount = 0 }) {
  activeWorkers++;
  try {
    console.log(`🚀 [Worker ${activeWorkers}] Minting Token #${tokenId} for ${walletAddress}`);

    const prompt = prompts.find(p => p.id === tokenId);
    if (!prompt) throw new Error("Prompt not found");

    if (isPaused()) {
      throw new Error("⏸️ Minting paused due to Kie.ai credit limit");
    }

    const taskId = await sendToKieAI(prompt.prompt);

    if (!taskId) {
      updateStatus(tokenId, {
        status: "FAILED",
        wallet: walletAddress,
        retryCount,
        error: "No taskId returned from Kie.ai"
      });
      throw new Error("Kie.ai did not return a valid taskId");
    }

    updateStatus(tokenId, {
      status: 'GENERATING',
      wallet: walletAddress,
      retryCount,
      taskId,
      startedAt: Date.now()
    });

    const imageUrl = await pollKieAITask(taskId);
    const imagePath = `./images/${tokenId}.png`;

    await downloadImage(imageUrl, imagePath);
    await delay(300);

    const isValid = await validateImageSize(imagePath);
    if (!isValid) throw new Error("Image is not 1024x1024");

    updateStatus(tokenId, {
      status: "COMPLETED",
      wallet: walletAddress,
      retryCount
    });

    console.log(`✅ Token #${tokenId} successfully completed`);
  } catch (err) {
    console.error(`❌ Token #${tokenId} failed: ${err.message}`);
    if (retryCount < MAX_RETRIES) {
      const delayTime = Math.min(600000, 2 ** retryCount * 60000);
      console.log(`↻ Retrying Token #${tokenId} in ${delayTime / 1000}s`);
      setTimeout(() => {
        retryQueue.push({ walletAddress, tokenId, retryCount: retryCount + 1 });
        processQueue();
      }, delayTime);
    } else {
      updateStatus(tokenId, {
        status: "FAILED",
        wallet: walletAddress,
        retryCount,
        error: err.message
      });
    }
  } finally {
    activeWorkers--;
    processQueue();
  }
}

function processQueue() {
  console.log(`📊 Workers: ${activeWorkers}/${MAX_CONCURRENT_MINTS} | Queue: ${mintQueue.length + retryQueue.length}`);
  while (activeWorkers < MAX_CONCURRENT_MINTS && (mintQueue.length || retryQueue.length)) {
    const next = retryQueue.length ? retryQueue.shift() : mintQueue.shift();
    if (next) processMint(next);
  }
}

async function addToMintQueue(walletAddress, tokenId = null, force = false) {
  const finalTokenId = tokenId || getNextTokenId();
  if (!finalTokenId) throw new Error('No available tokenId');

  const status = readStatusFile();
  const entry = status[finalTokenId];

  if (!force && (entry?.status === 'COMPLETED' || entry?.status === 'GENERATING' || entry?.status === 'QUEUED')) {
    console.log(`⚠️ Token ID ${finalTokenId} already in progress or completed`);
    return { tokenId: finalTokenId, skipped: true };
  }

  mintQueue.push({ walletAddress, tokenId: finalTokenId, retryCount: entry?.retryCount || 0 });

  updateStatus(finalTokenId, {
    status: "QUEUED",
    wallet: walletAddress,
    retryCount: entry?.retryCount || 0
  });

  console.log(`🟢 Queued token #${finalTokenId} for wallet ${walletAddress}`);
  processQueue();
  return { tokenId: finalTokenId };
}


module.exports = {
  addToMintQueue
};
