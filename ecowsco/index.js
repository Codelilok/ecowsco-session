const fs = require('fs');
const crypto = require('crypto');

/**
 * Generate ECOWSCO-MD branded ID
 * Example: ECOWSCO-MD-A8K29L
 */
function ecowscoId(length = 6) {
  const random = crypto
    .randomBytes(length)
    .toString("hex")
    .slice(0, length)
    .toUpperCase();

  return "ECOWSCO-MD-" + random;
}

/**
 * Generate 8-character random code
 */
function generateRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Remove file or folder safely
 */
async function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;

  await fs.promises.rm(FilePath, { recursive: true, force: true });
  return true;
}

module.exports = { ecowscoId, removeFile, generateRandomCode };
