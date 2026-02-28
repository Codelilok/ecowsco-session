const { 
    ecowscoId,
    removeFile
} = require('../ecowsco'); 
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: ecowscoConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

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
            let Bot = ecowscoConnect({
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
                                    body { display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:#000; font-family:Arial,sans-serif; color:#fff; text-align:center; padding:20px; box-sizing:border-box; }
                                    .container { width:100%; max-width:600px; }
                                    .qr-container { position:relative; margin:20px auto; width:300px; height:300px; display:flex; justify-content:center; align-items:center; }
                                    .qr-code { width:300px; height:300px; padding:10px; background:white; border-radius:20px; box-shadow:0 0 0 10px rgba(255,255,255,0.1),0 0 0 20px rgba(255,255,255,0.05),0 0 30px rgba(255,255,255,0.2); }
                                    .qr-code img { width:100%; height:100%; }
                                    h1 { color:#fff; margin:0 0 15px 0; font-size:28px; font-weight:800; text-shadow:0 0 10px rgba(255,255,255,0.3); }
                                    p { color:#ccc; margin:20px 0; font-size:16px; }
                                    .back-btn { display:inline-block; padding:12px 25px; margin-top:15px; background:linear-gradient(135deg,#6e48aa 0%,#9d50bb 100%); color:white; text-decoration:none; border-radius:30px; font-weight:bold; border:none; cursor:pointer; transition:all 0.3s ease; box-shadow:0 4px 15px rgba(0,0,0,0.2); }
                                    .back-btn:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.3); }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>ECOWSCO MD QR CODE</h1>
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

                if (connection === "open") {
                    await delay(10000);
                    let sessionData = null, attempts = 0;
                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data.length > 100) sessionData = data;
                            }
                            await delay(2000);
                            attempts++;
                        } catch {
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) return cleanUpSession();

                    try {
                        const compressedData = zlib.gzipSync(sessionData);
                        const b64data = compressedData.toString('base64');
                        await sendButtons(Bot, Bot.user.id, {
                            title: '',
                            text: 'ECOWSCO~' + b64data,
                            footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ ᴍᴅ*`,
                            buttons: [{ name:'cta_copy', buttonParamsJson: JSON.stringify({ display_text:'Copy Session', copy_code:'ECOWSCO~' + b64data }) }]
                        });
                        await delay(2000);
                        await Bot.ws.close();
                    } finally {
                        await cleanUpSession();
                    }
                }
                else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    ECOWSCO_QR_CODE();
                }
            });
        } catch (err) {
            if (!responseSent) res.status(500).json({ code:"QR Service is Currently Unavailable" });
            await cleanUpSession();
        }
    }

    try { await ECOWSCO_QR_CODE(); }
    catch { await cleanUpSession(); if (!responseSent) res.status(500).json({ code:"Service Error" }); }
});

module.exports = router;
