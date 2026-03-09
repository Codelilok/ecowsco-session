const { 
    ecowscoId,
    removeFile,
    safeGroupAcceptInvite  // Added this import
} = require('../ecowsco');

const { SESSION_PREFIX, GC_JID } = require('../config');  // Added config import
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
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

const router = express.Router();
const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = ecowscoId();
    let responseSent = false;
    let sessionCleanedUp = false;
    
    // Get number from query parameter (for QR, we need to specify who to send to)
    let num = req.query.number;  // Add ?number=233... to your QR URL

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (err) {
                console.error("Cleanup error:", err);
            }
            sessionCleanedUp = true;
        }
    }

    async function ECOWSCO_QR_CODE() {
        let sessionSuccessfullyDelivered = false;  // Added flag to prevent unnecessary reconnections
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
                getMessage: async () => undefined  // IMPORTANT: Added required option
            });

            Bot.ev.on('creds.update', saveCreds);

            Bot.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                /* ---------------- SHOW QR ---------------- */

                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);

                    if (!res.headersSent) {
                        res.send(`
                        <html>
                        <head>
                        <title>ECOWSCO MD QR</title>
                        <style>
                        body{
                        display:flex;
                        justify-content:center;
                        align-items:center;
                        height:100vh;
                        background:#000;
                        color:white;
                        font-family:Arial;
                        text-align:center;
                        margin:0;
                        padding:20px;
                        }
                        .container{
                        max-width:400px;
                        width:100%;
                        }
                        h2{
                        color:#00ff88;
                        margin-bottom:30px;
                        font-size:24px;
                        }
                        img{
                        width:100%;
                        max-width:300px;
                        height:auto;
                        background:white;
                        padding:15px;
                        border-radius:20px;
                        box-shadow:0 0 20px rgba(0,255,136,0.3);
                        }
                        .footer{
                        margin-top:30px;
                        color:#888;
                        font-size:14px;
                        }
                        </style>
                        </head>
                        <body>
                        <div class="container">
                        <h2>🔷 Scan QR To Connect 🔷</h2>
                        <img src="${qrImage}" alt="QR Code">
                        <div class="footer">ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ</div>
                        </div>
                        </body>
                        </html>
                        `);
                        responseSent = true;
                    }
                }

                /* ---------------- CONNECTION OPEN ---------------- */

                if (connection === "open") {
                    console.log("Bot connected. ID:", Bot.user?.id);

                    // 🔹 Auto join group after successful connection (using config)
                    try {
                        if (GC_JID) {
                            await safeGroupAcceptInvite(Bot, GC_JID);
                            console.log("✅ Auto joined ECOWSCO group successfully");
                        }
                    } catch (joinError) {
                        console.error("❌ Group join error:", joinError.message);
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
                        } catch (err) {
                            console.error("Read error:", err);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.error("No session data found after maximum attempts");
                        await cleanUpSession();
                        return;
                    }

                    console.log("Session data size:", sessionData.length);

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        await delay(5000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        // ✅ FIXED: Determine where to send the session
                        let targetJid;
                        
                        if (num) {
                            // If number is provided in query, send to that number
                            targetJid = num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`;
                            console.log(`📱 Sending session to provided number: ${targetJid}`);
                        } else {
                            // Fallback: If no number provided, send to self (bot's own chat)
                            targetJid = Bot.user.id;
                            console.log(`⚠️ No number provided, sending session to self: ${targetJid}`);
                            console.log(`💡 To receive session on your phone, add ?number=YOUR_NUMBER to the URL`);
                        }

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                /* ---------- SEND BUTTON ---------- */
                                try {
                                    await sendButtons(Bot, targetJid, {
                                        title: '',
                                        text: SESSION_PREFIX + b64data,  // Using prefix from config
                                        footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ*',
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
                                    console.log("✅ Session sent via button successfully");
                                    sessionSent = true;
                                } catch (btnErr) {
                                    console.log("⚠️ Button failed, trying text fallback:", btnErr.message);
                                    
                                    // Fallback to text message
                                    try {
                                        await Bot.sendMessage(targetJid, {
                                            text: SESSION_PREFIX + b64data  // Using prefix from config
                                        });
                                        console.log("✅ Session sent via text fallback successfully");
                                        sessionSent = true;
                                    } catch (textErr) {
                                        console.error("❌ Text fallback also failed:", textErr.message);
                                        sendAttempts++;
                                        if (sendAttempts < maxSendAttempts) {
                                            await delay(3000);
                                        }
                                    }
                                }
                            } catch (sendErr) {
                                console.error("❌ Send error:", sendErr.message);
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
                }

                /* ---------------- CONNECTION CLOSE ---------------- */

                else if (connection === "close") {
                    // Only reconnect if session wasn't delivered and it's not an auth error
                    const shouldReconnect = !sessionSuccessfullyDelivered && 
                        lastDisconnect &&
                        lastDisconnect.error &&
                        lastDisconnect.error.output?.statusCode != 401;

                    if (shouldReconnect) {
                        console.log("Connection closed without delivery, reconnecting in 5 seconds...");
                        await delay(5000);
                        ECOWSCO_QR_CODE();
                    } else if (sessionSuccessfullyDelivered) {
                        console.log("Connection closed normally after successful session delivery");
                    } else {
                        console.log("Connection closed permanently (Status: " + (lastDisconnect?.error?.output?.statusCode || "Unknown") + ")");
                    }
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).send(`
                <html>
                <head><title>Error</title></head>
                <body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
                <div style="text-align:center;">
                <h2>❌ Service Error</h2>
                <p>Please try again later</p>
                </div>
                </body>
                </html>
                `);
            }
            await cleanUpSession();
        }
    }

    // Create session directory if it doesn't exist
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    try {
        await ECOWSCO_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).send("QR Service Error");
        }
    }
});

module.exports = router;