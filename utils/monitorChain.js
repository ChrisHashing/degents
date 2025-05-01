
const { ethers } = require("ethers");
const { addToMintQueue } = require("./queue");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];



const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

function monitorMints() {
  contract.on("Transfer", async (from, to, tokenIdBN) => {
    if (from === ethers.constants.AddressZero) {
      try {
        const tokenId = tokenIdBN.toNumber(); // correctly convert the BigNumber
        console.log(`🎉 Mint detected: Token #${tokenId} by ${to}`);
        await addToMintQueue(to, tokenId);
      } catch (err) {
        console.error(`❌ Error processing mint for ${to}:`, err.message);
      }
    }
  });
  
  

  contract.on("error", (err) => {
    console.error("🚨 Error with contract listener:", err.message);
  });

  provider.on("error", (err) => {
    console.error("🚨 Provider error (possibly rate-limited):", err.message);
  });

  console.log("👀 Listening for on-chain mints...");
}

module.exports = { monitorMints };
