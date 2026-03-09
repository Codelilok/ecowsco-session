const { 
    ecowscoId,
    removeFile,
    generateRandomCode,
    safeGroupAcceptInvite  // Added this import
} = require('../ecowsco');

const { SESSION_PREFIX, GC_JID } = require('../config');  // IMPORTANT: Added config import
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: ecowscoConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = ecowscoId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function ECOWSCO_PAIR_CODE() {
        let sessionSuccessfullyDelivered = false;  // Flag to prevent unnecessary reconnections
        const { version } = await fetchLatestBaileysVersion();
        console.log("Baileys Version:", version);  // Added version logging
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));

        try {
            let Bot = ecowscoConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,  // IMPORTANT: Required option
            });

            if (!Bot.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const randomCode = generateRandomCode();
                const code = await Bot.requestPairingCode(num, randomCode);

                if (!responseSent && !res.headersSent) {
                    res.json({ code: code });  // Send pairing code to user
                    responseSent = true;
                }
            }

            Bot.ev.on('creds.update', saveCreds);

            Bot.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log("Bot connected. ID:", Bot.user?.id);
                    
                    // IMPORTANT: Auto join group after successful connection (like your boss's code)
                    try {
                        if (GC_JID) {
                            await safeGroupAcceptInvite(Bot, GC_JID);
                            console.log("Joined group successfully");
                        }
                    } catch (groupError) {
                        console.error("Failed to join group:", groupError.message);
                        // Continue even if group join fails
                    }
                    
                    await delay(50000);  // Wait for session to be fully ready

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(8000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    console.log("Session data size:", sessionData?.length);

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        await delay(5000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        // ✅ FIXED: Send to YOUR number (the one used for pairing)
                        const targetJid = num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`;
                        console.log(`📱 Sending session to YOUR number: ${targetJid}`);

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                // Try sending buttons with session data
                                try {
                                    await sendButtons(Bot, targetJid, {
                                        title: '',
                                        text: SESSION_PREFIX + b64data,  // Using prefix from config
                                        footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ*`,
                                        buttons: [
                                            {
                                                name: 'cta_copy',
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: 'Copy Session ID',
                                                    copy_code: SESSION_PREFIX + b64data  // Using prefix from config
                                                })
                                            }
                                        ]
                                    });
                                    console.log(`✅ Session sent to YOUR number via buttons`);
                                    sessionSent = true;
                                } catch (btnErr) {
                                    console.error("⚠️ Button delivery failed:", btnErr.message);
                                    // Fallback: Send plain text
                                    try {
                                        await Bot.sendMessage(targetJid, { 
                                            text: SESSION_PREFIX + b64data  // Using prefix from config
                                        });
                                        console.log(`✅ Session sent to YOUR number via fallback text`);
                                        sessionSent = true;
                                    } catch (textErr) {
                                        console.error("❌ Text fallback failed:", textErr);
                                        sendAttempts++;
                                        if (sendAttempts < maxSendAttempts) {
                                            await delay(3000);
                                        }
                                    }
                                }
                            } catch (sendError) {
                                console.error("❌ Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            console.error("Failed to send session after multiple attempts");
                            await cleanUpSession();
                            return;
                        }

                        sessionSuccessfullyDelivered = true;  // Mark as successful
                        await delay(3000);
                        
                        try {
                            await Bot.ws.close();
                            console.log("Connection closed successfully");
                        } catch (closeErr) {
                            console.error("Error closing connection:", closeErr.message);
                        }

                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }

                } else if (connection === "close" && !sessionSuccessfullyDelivered && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    // Only reconnect if session wasn't delivered and it's not an auth error
                    console.log("Connection closed without delivery, reconnecting...");
                    await delay(5000);
                    ECOWSCO_PAIR_CODE();
                } else if (connection === "close") {
                    console.log("Connection closed permanently (Status: " + (lastDisconnect?.error?.output?.statusCode || "Unknown") + ")");
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await ECOWSCO_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;