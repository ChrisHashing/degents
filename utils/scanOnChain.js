const { ethers } = require("ethers");
const { addToMintQueue } = require("./queue");
const { readStatusFile, updateStatus } = require("./status");
const { downloadImage } = require("./downloadImage");
const { pollKieAITask } = require("./kieai");
const sharp = require("sharp");
const fs = require("fs");
const prompts = require("../prompt.json");

const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ABI = [
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

async function waitForImage(path, maxTries = 5, interval = 300) {
  while (maxTries--) {
    if (fs.existsSync(path) && fs.statSync(path).size > 10000) {
      return true;
    }
    await new Promise(res => setTimeout(res, interval));
  }
  return false;
}

async function validateImageSize(path) {
  const ready = await waitForImage(path);
  if (!ready) {
    console.warn("🛑 Image file not ready or too small");
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
    console.error("🛑 Sharp image check failed:", err.message);
    return false;
  }
}

async function scanFromChain() {
  try {
    const total = await contract.totalSupply();
    const status = readStatusFile();

    for (let tokenId = 1; tokenId <= total; tokenId++) {
      const id = String(tokenId);
      const entry = status[id];
      const promptExists = prompts.some(p => p.id === tokenId);

      if (!promptExists) {
        console.log(`⛔ Skipping token #${tokenId}: no matching prompt.`);
        continue;
      }

      if (!entry || entry.status === "FAILED") {
        try {
          const wallet = await contract.ownerOf(tokenId);
          console.log(`🔍 Queuing token #${tokenId} - owner: ${wallet}`);
          await addToMintQueue(wallet, tokenId);
        } catch (err) {
          console.warn(`⚠️ ownerOf failed for token #${tokenId}: ${err.message}`);
        }

      } else if (entry.status === "GENERATING" && entry.taskId) {
        try {
          const imagePath = `./images/${tokenId}.png`;

          // Check if image is already valid
          const isAlreadyValid = await validateImageSize(imagePath);
          if (isAlreadyValid) {
            updateStatus(tokenId, { ...entry, status: "COMPLETED" });
            console.log(`🧠 Token #${tokenId} already completed locally`);
            continue;
          }

          // Poll and download fresh image
          const imageUrl = await pollKieAITask(entry.taskId);
          if (!imageUrl) throw new Error("Kie.ai task not completed yet");

          await downloadImage(imageUrl, imagePath);
          const isValid = await validateImageSize(imagePath);

          updateStatus(tokenId, {
            ...entry,
            status: isValid ? "COMPLETED" : "FAILED"
          });

          console.log(`✅ Token #${tokenId} marked as ${isValid ? "COMPLETED" : "FAILED"}`);

        } catch (err) {
          console.warn(`❌ Polling failed for #${tokenId}: ${err.message}`);
          updateStatus(tokenId, { ...entry, status: "FAILED" });
        }
      }
    }
  } catch (err) {
    console.error("❌ Error scanning chain:", err.message);
  }
}

function startScan(intervalMs = 60000) {
  console.log(`🧭 Scanning chain every ${intervalMs / 1000}s for missed mints...`);
  scanFromChain();
  setInterval(scanFromChain, intervalMs);
}

module.exports = { startScan };
