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
                generateHighQualityLinkPreview: true
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
                        text-align:center
                        }
                        img{
                        width:300px;
                        height:300px;
                        background:white;
                        padding:15px;
                        border-radius:20px
                        }
                        </style>
                        </head>
                        <body>
                        <div>
                        <h2>Scan QR To Connect</h2>
                        <img src="${qrImage}">
                        </div>
                        </body>
                        </html>
                        `);

                        responseSent = true;
                    }
                }

                /* ---------------- CONNECTION OPEN ---------------- */

                if (connection === "open") {

    console.log("Bot connected:", Bot.user?.id);

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

                        } catch (err) {

                            console.error("Read error:", err);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    console.log("Session size:", sessionData.length);

                    try {

                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');

                        await delay(5000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        const targetJid = Bot.user.id;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {

                            try {

                                /* ---------- SEND BUTTON ---------- */

                                try {

                                    await sendButtons(Bot, targetJid, {
                                        title: '',
                                        text: 'ECOWSCO~' + b64data,
                                        footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴄᴏᴡsᴄᴏ*',
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

                                    console.log("Session sent via button");

                                } catch (btnErr) {

                                    console.log("Button failed, sending text fallback");

                                    await Bot.sendMessage(targetJid, {
                                        text: 'ECOWSCO~' + b64data
                                    });

                                }

                                sessionSent = true;

                            } catch (sendErr) {

                                console.error("Send error:", sendErr);
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

                        console.error("Session error:", sessionError);

                    } finally {

                        await cleanUpSession();
                    }

                }

                /* ---------------- CONNECTION CLOSE ---------------- */

                else if (connection === "close") {

                    const shouldReconnect = lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output.statusCode != 401;

                    if (shouldReconnect) {

                        console.log("Reconnecting...");
                        await delay(5000);
                        ECOWSCO_QR_CODE();

                    } else {

                        console.log("Connection closed permanently");
                    }
                }

            });

        } catch (err) {

            console.error("Main error:", err);

            if (!responseSent && !res.headersSent) {
                res.status(500).send("QR Service Error");
            }

            await cleanUpSession();
        }
    }

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    await ECOWSCO_QR_CODE();

});

module.exports = router;