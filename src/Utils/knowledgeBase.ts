/**
 * knowledgeBase.ts
 * Memuat semua modul Command dari folder Commands secara otomatis.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface KnowledgeEntry {
    keywords: string[]
    execute: (client: any, sender: string) => Promise<void>
}

export const knowledgeMap = new Map<string, KnowledgeEntry>()
export const keywordIndex = new Map<string, KnowledgeEntry>()

const knowledgeBasePath = path.join(__dirname, '../Commands')

export function loadKnowledgeBase(): void {
    const files = fs.readdirSync(knowledgeBasePath).filter(f => f.endsWith('.js'))

    for (const file of files) {
        try {
            const modulePath = path.join(knowledgeBasePath, file)
            const kb: KnowledgeEntry = require(modulePath)

            if (!kb.keywords || !kb.execute) {
                console.warn(`[KnowledgeBase] Lewati ${file}: tidak ada keywords/execute.`)
                continue
            }

            knowledgeMap.set(file, kb)

            for (const key of kb.keywords) {
                const normalizedKey = key.toLowerCase().normalize('NFKC').trim()
                keywordIndex.set(normalizedKey, kb)
            }

            console.log(`[KnowledgeBase] Loaded: ${file} (${kb.keywords.length} keywords)`)
        } catch (err) {
            console.error(`[KnowledgeBase] Gagal load ${file}:`, err)
        }
    }

    console.log(`[KnowledgeBase] Total: ${keywordIndex.size} keywords dari ${knowledgeMap.size} modul.`)
}