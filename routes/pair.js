const {
    ecowscoId,
    removeFile
} = require('../ecowsco');

const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const pino = require("pino");
const { sendButtons } = require('gifted-btns');

const {
    default: ecowscoConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

let router = express.Router();
const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const number = req.query.number;

    if (!number) {
        return res.status(400).json({
            error: "Phone number is required. Use ?number=234XXXXXXXXXX"
        });
    }

    const id = ecowscoId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            sessionCleanedUp = true;
        }
    }

    async function ECOWSCO_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } =
            await useMultiFileAuthState(path.join(sessionDir, id));

        try {
            const Bot = ecowscoConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" })
            });

            Bot.ev.on('creds.update', saveCreds);

            Bot.ev.on("connection.update", async ({ connection }) => {

                if (connection === "open") {

                    await delay(10000);

                    let sessionData = null;
                    const credsPath = path.join(sessionDir, id, "creds.json");

                    if (fs.existsSync(credsPath)) {
                        const data = fs.readFileSync(credsPath);
                        if (data.length > 100) {
                            sessionData = data;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    const compressed = zlib.gzipSync(sessionData);
                    const base64 = compressed.toString('base64');
                    const finalSession = "ECOWSCO~" + base64;

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

                    await delay(2000);
                    await Bot.ws.close();
                    await cleanUpSession();
                }
            });

            const pairingCode = await Bot.requestPairingCode(number);
            console.log(`Pairing code generated for ${number}: ${pairingCode}`);

            if (!responseSent) {
                res.json({
                    pairingCode: pairingCode
                });
                responseSent = true;
            }

        } catch (error) {
            console.error("Error in ECOWSCO_PAIR_CODE:", error);
            if (!responseSent) {
                res.status(500).json({
                    error: "Pairing service unavailable",
                    details: error.message
                });
            }
            await cleanUpSession();
        }
    }

    try {
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        await ECOWSCO_PAIR_CODE();
    } catch (err) {
        console.error("Global Error in /code route:", err);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({
                error: "Service Error",
                details: err.message
            });
        }
    }
});

module.exports = router;
