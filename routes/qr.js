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

                /* ---------------- SHOW QR (UPGRADED UI) ---------------- */

                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);

                    if (!res.headersSent) {
                        res.send(`
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                            <title>ECOWSCO-MD · QR CONNECT</title>
                            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                            <style>
                                * {
                                    margin: 0;
                                    padding: 0;
                                    box-sizing: border-box;
                                }

                                body {
                                    font-family: 'Inter', 'Poppins', system-ui, -apple-system, sans-serif;
                                    background: radial-gradient(circle at 70% 20%, #0b2638, #030e17 90%);
                                    min-height: 100vh;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    color: #ffffff;
                                    position: relative;
                                    overflow-x: hidden;
                                    padding: 1rem;
                                }

                                /* Animated background orbs */
                                .orb {
                                    position: fixed;
                                    width: 80vmax;
                                    height: 80vmax;
                                    border-radius: 50%;
                                    background: radial-gradient(circle at 40% 40%, rgba(0, 191, 255, 0.15), rgba(0, 70, 140, 0.02) 70%);
                                    filter: blur(90px);
                                    z-index: 0;
                                    animation: orbFloat 25s infinite alternate ease-in-out;
                                    pointer-events: none;
                                }

                                .orb2 {
                                    bottom: 0;
                                    right: 0;
                                    width: 70vmax;
                                    height: 70vmax;
                                    background: radial-gradient(circle at 70% 70%, rgba(120, 0, 255, 0.1), rgba(0, 160, 255, 0.02));
                                    filter: blur(110px);
                                    animation: orbFloat2 30s infinite alternate;
                                }

                                @keyframes orbFloat {
                                    0% { transform: translate(-10%, -10%) scale(1); }
                                    100% { transform: translate(12%, 12%) scale(1.2); }
                                }

                                @keyframes orbFloat2 {
                                    0% { transform: translate(5%, 5%) scale(1); }
                                    100% { transform: translate(-20%, -15%) scale(1.3); }
                                }

                                /* Particle field */
                                .particle-field {
                                    position: fixed;
                                    top: 0;
                                    left: 0;
                                    width: 100%;
                                    height: 100%;
                                    z-index: 0;
                                    overflow: hidden;
                                    pointer-events: none;
                                }

                                .tech-dot {
                                    position: absolute;
                                    background: rgba(100, 210, 255, 0.25);
                                    box-shadow: 0 0 10px #00dcff40;
                                    border-radius: 50%;
                                    width: 4px;
                                    height: 4px;
                                    animation: dotRise 16s infinite linear;
                                }

                                @keyframes dotRise {
                                    0% { transform: translateY(0) scale(1); opacity: 0.3; }
                                    100% { transform: translateY(-100vh) scale(0.2); opacity: 0; }
                                }

                                /* Home button */
                                .home-btn {
                                    position: fixed;
                                    top: 1.5rem;
                                    right: 1.5rem;
                                    background: rgba(20, 50, 80, 0.55);
                                    backdrop-filter: blur(12px);
                                    -webkit-backdrop-filter: blur(12px);
                                    border: 1px solid rgba(0, 191, 255, 0.35);
                                    color: #e0f0ff;
                                    padding: 0.75rem 1.6rem;
                                    border-radius: 60px;
                                    font-weight: 500;
                                    text-decoration: none;
                                    z-index: 100;
                                    display: flex;
                                    align-items: center;
                                    gap: 0.6rem;
                                    font-size: 0.95rem;
                                    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                                    transition: 0.2s;
                                }

                                .home-btn:hover {
                                    background: rgba(30, 70, 120, 0.7);
                                    border-color: #00c3ff;
                                    transform: translateY(-3px);
                                    box-shadow: 0 0 25px #00aeff60;
                                }

                                /* Main QR Card */
                                .qr-card {
                                    position: relative;
                                    z-index: 20;
                                    width: 100%;
                                    max-width: 480px;
                                    background: rgba(8, 28, 45, 0.5);
                                    backdrop-filter: blur(20px) saturate(180%);
                                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                                    border-radius: 40px;
                                    padding: 2.8rem 2rem;
                                    box-shadow: 0 40px 70px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(0, 220, 255, 0.15) inset;
                                    border: 1px solid rgba(0, 191, 255, 0.3);
                                    text-align: center;
                                }

                                .qr-card:hover {
                                    border-color: rgba(0, 191, 255, 0.6);
                                }

                                .icon-header {
                                    font-size: 3rem;
                                    margin-bottom: 0.5rem;
                                    color: #00c8ff;
                                    filter: drop-shadow(0 0 15px #00a6ff);
                                }

                                h1 {
                                    font-size: 2.4rem;
                                    font-weight: 700;
                                    background: linear-gradient(135deg, #fff, #b3ecff, #7fd4ff);
                                    -webkit-background-clip: text;
                                    background-clip: text;
                                    color: transparent;
                                    margin-bottom: 0.5rem;
                                    text-shadow: 0 0 12px #00aaff80;
                                }

                                .subhead {
                                    color: #b0d4f0;
                                    font-weight: 300;
                                    margin-bottom: 2rem;
                                    font-size: 1rem;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 0.5rem;
                                }

                                .qr-wrapper {
                                    background: rgba(255, 255, 255, 0.05);
                                    border-radius: 30px;
                                    padding: 1.5rem;
                                    margin-bottom: 1.5rem;
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
                                }

                                .qr-container {
                                    background: white;
                                    border-radius: 20px;
                                    padding: 1rem;
                                    display: inline-block;
                                    box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
                                    animation: qrPulse 2s infinite alternate;
                                }

                                @keyframes qrPulse {
                                    0% { box-shadow: 0 0 20px rgba(0, 200, 255, 0.3); }
                                    100% { box-shadow: 0 0 40px rgba(0, 200, 255, 0.7); }
                                }

                                img {
                                    width: 100%;
                                    max-width: 250px;
                                    height: auto;
                                    display: block;
                                    border-radius: 10px;
                                }

                                .status-badge {
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 0.5rem;
                                    background: rgba(0, 200, 0, 0.15);
                                    border: 1px solid #00ff8840;
                                    padding: 0.5rem 1.2rem;
                                    border-radius: 50px;
                                    font-size: 0.9rem;
                                    color: #9effc0;
                                    margin-top: 1rem;
                                }

                                .status-badge i {
                                    color: #00ff88;
                                    animation: pulse 1.5s infinite;
                                }

                                @keyframes pulse {
                                    0% { opacity: 0.6; }
                                    50% { opacity: 1; }
                                    100% { opacity: 0.6; }
                                }

                                .instruction {
                                    color: #9ac3d9;
                                    font-size: 0.9rem;
                                    margin: 1rem 0;
                                    background: rgba(0, 50, 80, 0.3);
                                    padding: 0.8rem;
                                    border-radius: 50px;
                                    backdrop-filter: blur(5px);
                                }

                                .instruction i {
                                    color: #00c8ff;
                                    margin-right: 0.5rem;
                                }

                                .footer-note {
                                    margin-top: 1.5rem;
                                    color: #608b9f;
                                    font-size: 0.8rem;
                                }

                                /* Mobile responsive */
                                @media (max-width: 480px) {
                                    .qr-card {
                                        padding: 2rem 1.2rem;
                                    }
                                    h1 {
                                        font-size: 2rem;
                                    }
                                    .icon-header {
                                        font-size: 2.5rem;
                                    }
                                    .home-btn {
                                        top: 1rem;
                                        right: 1rem;
                                        padding: 0.6rem 1.2rem;
                                        font-size: 0.85rem;
                                    }
                                }
                            </style>
                        </head>
                        <body>
                            <!-- Animated orbs -->
                            <div class="orb" style="top: -10%; left: -5%;"></div>
                            <div class="orb orb2"></div>

                            <!-- Particles -->
                            <div class="particle-field" id="particleField"></div>

                            <!-- Home button -->
                            <a href="/" class="home-btn">
                                <i class="fas fa-arrow-left"></i> Home
                            </a>

                            <!-- Main QR Card -->
                            <div class="qr-card">
                                <div class="icon-header">
                                    <i class="fa-regular fa-qrcode"></i>
                                </div>
                                <h1>CONNECT BOT</h1>
                                <div class="subhead">
                                    <i class="fa-regular fa-circle-check" style="color: #4ae2ff;"></i> 
                                    WhatsApp Pairing
                                </div>

                                <div class="qr-wrapper">
                                    <div class="qr-container">
                                        <img src="${qrImage}" alt="QR Code">
                                    </div>
                                </div>

                                <div class="status-badge">
                                    <i class="fa-solid fa-circle"></i>
                                    <span>Waiting for scan...</span>
                                </div>

                                <div class="instruction">
                                    <i class="fa-regular fa-mobile-notch"></i>
                                    Open WhatsApp > Linked Devices > Scan QR
                                </div>

                                <div class="footer-note">
                                    <i class="fa-regular fa-clock"></i> Code refreshes automatically
                                </div>
                            </div>

                            <script>
                                // Particle generator
                                (function() {
                                    const container = document.getElementById('particleField');
                                    if (!container) return;
                                    const particleCount = window.innerWidth < 600 ? 20 : 40;
                                    for (let i = 0; i < particleCount; i++) {
                                        const dot = document.createElement('span');
                                        dot.className = 'tech-dot';
                                        const size = 2 + Math.random() * 5;
                                        dot.style.width = size + 'px';
                                        dot.style.height = size + 'px';
                                        dot.style.left = Math.random() * 100 + '%';
                                        dot.style.bottom = '0';
                                        dot.style.animationDuration = (8 + Math.random() * 14) + 's';
                                        dot.style.animationDelay = (Math.random() * 5) + 's';
                                        dot.style.opacity = 0.2 + Math.random() * 0.3;
                                        dot.style.backgroundColor = \`rgba(\${100 + Math.random()*100}, 220, 255, 0.6)\`;
                                        container.appendChild(dot);
                                    }
                                })();
                            </script>
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
                <head>
                    <title>Error</title>
                    <style>
                        body {
                            background: #0a1420;
                            color: #ff6b6b;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            font-family: 'Inter', Arial, sans-serif;
                            margin: 0;
                            padding: 20px;
                        }
                        .error-card {
                            background: rgba(255, 70, 70, 0.1);
                            backdrop-filter: blur(10px);
                            border: 1px solid #ff6b6b40;
                            padding: 2rem;
                            border-radius: 30px;
                            text-align: center;
                            max-width: 350px;
                        }
                        h2 {
                            color: #ff8a8a;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #bbbbbb;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-card">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ff8a8a; margin-bottom: 1rem;"></i>
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