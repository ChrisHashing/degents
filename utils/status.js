const fs = require('fs');

const STATUS_FILE = './status.json';

function readStatusFile() {
  if (!fs.existsSync(STATUS_FILE)) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({}));
  }
  const rawData = fs.readFileSync(STATUS_FILE);
  return JSON.parse(rawData);
}

function writeStatusFile(data) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

function updateStatus(tokenId, newStatus) {
  const statusData = readStatusFile();
  statusData[tokenId] = newStatus;
  writeStatusFile(statusData);
}

module.exports = {
  readStatusFile,
  updateStatus,
  writeStatusFile
};