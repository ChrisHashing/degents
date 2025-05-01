
const { readStatusFile, writeStatusFile, updateStatus } = require("./status");
const { pollKieAITask } = require("./kieai");
const { downloadImage } = require("./downloadImage");
const prompts = require("../prompt.json");
const fs = require("fs");
const sharp = require("sharp");
const { ethers } = require("ethers");
const { addToMintQueue } = require('./queue');

const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  ["function totalSupply() view returns (uint256)", "function ownerOf(uint256) view returns (address)"],
  provider
);

async function validateImage(path) {
  if (!fs.existsSync(path)) return false;
  try {
    const meta = await sharp(path).metadata();
    return meta.width === 1024 && meta.height === 1024;
  } catch {
    return false;
  }
}

async function recoverQueuedJobs() {
  const status = readStatusFile();
  for (const [tokenId, entry] of Object.entries(status)) {
    if (entry.status === "QUEUED") {
      console.log(`🔁 Recovering stuck token #${tokenId} (QUEUED) for wallet ${entry.wallet}`);
      await addToMintQueue(entry.wallet, parseInt(tokenId), true); // force = true
    }
  }
}

async function integrityCheck() {
  const status = readStatusFile();
  const totalSupply = await contract.totalSupply();
  const statusIds = Object.keys(status).map(id => parseInt(id));

  // 1. Remove entries above totalSupply
  for (const id of statusIds) {
    if (id > totalSupply) {
      console.log(`🗑️ Removing tokenId ${id} - exceeds totalSupply`);
      delete status[id];
    }
  }

  // 2. Check tokens 1 to totalSupply
  for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
    const entry = status[tokenId];
    const promptExists = prompts.some(p => p.id === tokenId);
    if (!promptExists) continue;

    const imgPath = `./images/${tokenId}.png`;
    if (!entry) {
      const wallet = await contract.ownerOf(tokenId);
      console.log(`🟡 Missing entry for Token #${tokenId}, queuing...`);
      updateStatus(tokenId, { status: "QUEUED", wallet, retryCount: 0 });
      continue;
    }

    if (entry.status === "COMPLETED") {
      const valid = await validateImage(imgPath);
      if (!valid) {
        console.warn(`❌ Image missing or invalid for #${tokenId}, marking FAILED`);
        updateStatus(tokenId, { ...entry, status: "FAILED" });
      }
    }

    if (entry.status === "GENERATING" && entry.taskId) {
      try {
        const imageUrl = await pollKieAITask(entry.taskId);
        await downloadImage(imageUrl, imgPath);
        const valid = await validateImage(imgPath);
        updateStatus(tokenId, { ...entry, status: valid ? "COMPLETED" : "FAILED" });
        console.log(`✅ Token #${tokenId} recovery complete.`);
      } catch (err) {
        console.warn(`⚠️ Poll failed for #${tokenId}: ${err.message}`);
        updateStatus(tokenId, { ...entry, status: "FAILED" });
      }
    }
  }

  writeStatusFile(status);
}

function startIntegrityWorker(intervalMs = 60000) {
  console.log(`🛠️ Starting integrity check every ${intervalMs / 1000}s`);
  integrityCheck();
  setInterval(integrityCheck, intervalMs);
}

module.exports = {
  startIntegrityWorker, recoverQueuedJobs
};
