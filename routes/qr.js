const { 
    ecowscoId,
    removeFile
} = require('../ecowsco');
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
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const router = express.Router();
const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = ecowscoId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            sessionCleanedUp = true;
        }
    }

    async function ECOWSCO_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));

        try {
            const Bot = ecowscoConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Bot.ev.on('creds.update', saveCreds);

            Bot.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {

                // Display QR code in browser
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>ECOWSCO MD | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        margin: 0;
                                        background-color: #000;
                                        font-family: Arial, sans-serif;
                                        color: #fff;
                                        text-align: center;
                                        padding: 20px;
                                        box-sizing: border-box;
                                    }
                                    .container { max-width: 600px; width: 100%; }
                                    .qr-container { width: 300px; height: 300px; margin: 20px auto; display: flex; justify-content: center; align-items: center; }
                                    .qr-code { width: 300px; height: 300px; padding: 10px; background: white; border-radius: 20px;
                                        box-shadow: 0 0 0 10px rgba(255,255,255,0.1),
                                                    0 0 0 20px rgba(255,255,255,0.05),
                                                    0 0 30px rgba(255,255,255,0.2);
                                        animation: pulse 2s infinite;
                                    }
                                    .qr-code img { width: 100%; height: 100%; }
                                    h1 { color: #fff; margin-bottom: 15px; font-size: 28px; font-weight: 800; }
                                    p { color: #ccc; font-size: 16px; margin: 20px 0; }
                                    .back-btn {
                                        display: inline-block;
                                        padding: 12px 25px;
                                        margin-top: 15px;
                                        background: linear-gradient(135deg, #6e48aa 0%, #9d50bb 100%);
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 30px;
                                        font-weight: bold;
                                        cursor: pointer;
                                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                                        transition: all 0.3s ease;
                                    }
                                    .back-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
                                    @keyframes pulse {
                                        0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
                                        70% { box-shadow: 0 0 0 15px rgba(255,255,255,0); }
                                        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>ECOWSCO QR CODE</h1>
                                    <div class="qr-container">
                                        <div class="qr-code">
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with your phone to connect</p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }
                }

                // When connection opens, save session and send buttons
                if (connection === "open") {
                    await delay(10000);

                    // Retry loop for creds.json
                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;
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
                            await delay(2000);
                            attempts++;
                        } catch (readErr) {
                            console.error("Read error:", readErr);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    const compressed = zlib.gzipSync(sessionData).toString('base64');
                    const finalSession = "ECOWSCO~" + compressed;

                    try {
                        await sendButtons(Bot, Bot.user.id, {
                            title: '',
                            text: finalSession,
                            footer: `> *POWERED BY ECOWSCO MD*`,
                            buttons: [
                                {
                                    name: 'cta_copy',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'Copy Session',
                                        copy_code: finalSession
                                    })
                                }
                            ]
                        });
                    } catch (sendErr) {
                        console.error("Error sending session:", sendErr);
                    } finally {
                        await delay(2000);
                        await Bot.ws.close();
                        await cleanUpSession();
                    }
                }

                // Reconnect logic if connection closes unexpectedly
                else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    ECOWSCO_QR_CODE();
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent) {
                res.status(500).send("QR Service is Currently Unavailable");
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    await ECOWSCO_QR_CODE();
});

module.exports = router;