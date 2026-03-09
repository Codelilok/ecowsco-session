const fs = require('fs');

/**
 * Generate random session ID
 * SAME logic as boss version (IMPORTANT for pairing stability)
 */
function ecowscoId(num = 4) {
  let result = "";
  let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let charactersLength = characters.length;

  for (let i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

/**
 * Generate 8-character pairing code
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
 * Remove file or folder safely with retry logic
 */
async function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;

  try {
    await fs.promises.rm(FilePath, { recursive: true, force: true });
    return true;
  } catch (err) {
    // If ENOTEMPTY, try again after a short delay
    if (err.code === 'ENOTEMPTY') {
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        await fs.promises.rm(FilePath, { recursive: true, force: true });
        return true;
      } catch (retryErr) {
        console.warn(`Failed to remove ${FilePath}:`, retryErr.message);
        return false;
      }
    }
    console.warn(`Failed to remove ${FilePath}:`, err.message);
    return false;
  }
}

/**
 * Safely accept group invite with error handling
 * ADDED THIS FUNCTION from boss's code
 */
const safeGroupAcceptInvite = async (Bot, groupJid) => {
    if (!groupJid) return false;
    try {
        await Bot.groupAcceptInvite(groupJid);
        console.log(`✅ Successfully joined group: ${groupJid}`);
        return true;
    } catch (error) {
        // Handle specific error codes like boss's code
        switch (error.data) {
            case 409: 
                console.log(`ℹ️ Already in group: ${groupJid}`); 
                break;
            case 400: 
                console.log(`❌ Invalid invite code for group: ${groupJid}`); 
                break;
            case 403: 
                console.log(`❌ No permission to join group: ${groupJid}`); 
                break;
            default: 
                console.error(`❌ Group join failed for ${groupJid}:`, error.message);
        }
        return false;
    }
};

module.exports = { 
  ecowscoId, 
  removeFile, 
  generateRandomCode,
  safeGroupAcceptInvite  // ADDED THIS EXPORT
};