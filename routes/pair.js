
const { 
    ecowscoId,
    removeFile,
    generateRandomCode
} = require('../ecowsco');

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
        const { version } = await fetchLatestBaileysVersion();
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
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us')
            });

            if (!Bot.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const randomCode = generateRandomCode();
                const code = await Bot.requestPairingCode(num, randomCode);

                if (!responseSent && !res.headersSent) {
                    res.json({ code });
                    responseSent = true;
                }
            }

            Bot.ev.on('creds.update', saveCreds);

            Bot.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log("Bot connected. ID:", Bot.user?.id);
                    if (!Bot.user?.id) return; // wait a bit more

                    // 🔹 Auto join ECOWSCO group
                    try {
                        await Bot.groupAcceptInvite("CaG3823YsyuHQwuV4TGLWU");
                        console.log("✅ Auto joined ECOWSCO group successfully");
                    } catch (joinError) {
                        console.error("❌ Group join error:", joinError);
                    }

                    await delay(50000);

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

                    console.log("Session data size:", sessionData?.length); // ✅ Log session size

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        await delay(5000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        const targetJid = num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`;
                        console.log(`Sending session to: ${targetJid}`);

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                // 🔹 Try sending buttons only
                                try {
                                    await sendButtons(Bot, targetJid, {
                                        title: '',
                                        text: 'ECOWSCO~' + b64data,
                                        footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ*`,
                                        buttons: [
                                            {
                                                name: 'cta_copy',
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: 'Copy Session ID',
                                                    copy_code: 'ECOWSCO~' + b64data
                                                })
                                            }
                                        ]
                                    });
                                    console.log(`✅ Session ID sent via buttons to ${targetJid}`);
                                } catch (btnErr) {
                                    console.error("⚠️ Button delivery failed (device/version mismatch):", btnErr.message);
                                    // 🔹 Fallback: Send plain text ONLY if button fails
                                    try {
                                        await Bot.sendMessage(targetJid, { 
                                            text: 'ECOWSCO~' + b64data
                                        });
                                        console.log(`✅ Session ID sent via fallback text to ${targetJid}`);
                                    } catch (textErr) {
                                        console.error("❌ Text fallback failed:", textErr);
                                    }
                                }
                                
                                sessionSent = true;
                            } catch (sendError) {
                                console.error("❌ Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            await cleanUpSession();
                            return;
                        }

                        await delay(3000);
                        await Bot.ws.close();

                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }

                } else if (connection === "close") {
                    const shouldReconnect = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401;
                    if (shouldReconnect) {
                        console.log("Reconnecting...");
                        await delay(5000);
                        ECOWSCO_PAIR_CODE();
                    } else {
                        console.log("Connection closed permanently (Status: " + (lastDisconnect?.error?.output?.statusCode || "Unknown") + ")");
                    }
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