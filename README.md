# ECOWSCO MD Session Generator

- Fork ⭐ the repo and edit as you wish
- Deploy to your favourite hosting server (Heroku, Render, Koyeb, VPS, etc)
- Generates WhatsApp Session IDs for **ECOWSCO MD bots**

---

## SAMPLE USAGE IN BOT

```js
// 1. IN YOUR LIB OR ANY FILE:
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

const sessionDir = path.join(__dirname, 'session')
const credsPath = path.join(sessionDir, 'creds.json')

function createDirIfNotExist(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

createDirIfNotExist(sessionDir)

async function loadSession() {
    try {

        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            throw new Error("SESSION_ID is missing")
        }

        const [header, b64data] = config.SESSION_ID.split('~')

        if (header !== "ECOWSCO") {
            throw new Error("Invalid Session Format")
        }

        const compressedData = Buffer.from(b64data, 'base64')

