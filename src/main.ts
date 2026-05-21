import {
    fetchLatestBaileysVersion,
    makeWASocket,
    useMultiFileAuthState,
} from 'baileys'
import * as P from 'pino'
import * as fs from 'fs'
import * as path from 'node:path'

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()

    const WhatsAppClient = makeWASocket({
        auth: state,
        version,
        logger: P.pino({ level: 'silent' }),
    })

    // Load event handlers dari folder Events
    const eventFolder = path.join(__dirname, 'Events')
    const eventFiles = fs.readdirSync(eventFolder).filter(f => f.endsWith('.js'))

    for (const file of eventFiles) {
        const thisFile = path.join(eventFolder, file)
        const event = require(thisFile)
        WhatsAppClient.ev.on(event.name, (...args: any[]) =>
            event.execute(WhatsAppClient, connectToWhatsApp, ...args)
        )
    }

    WhatsAppClient.ev.on('creds.update', saveCreds)
}

connectToWhatsApp()