/**
 * typoHandle.ts
 * Deteksi kemiripan teks menggunakan Levenshtein Distance.
 * Mendukung perbandingan kata-per-kata untuk kalimat panjang.
 */

/**
 * Menghitung Levenshtein Distance antara dua string.
 */
export function levenshteinDistance(a: string, b: string): number {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            )
        }
    }

    return dp[m][n]
}

/**
 * Skor kemiripan antara dua string (0.0 – 1.0).
 */
export function similarity(a: string, b: string): number {
    a = a.toLowerCase().normalize('NFKC').trim()
    b = b.toLowerCase().normalize('NFKC').trim()
    const distance = levenshteinDistance(a, b)
    const maxLen = Math.max(a.length, b.length)
    return maxLen === 0 ? 1 : 1 - distance / maxLen
}

/**
 * Cocokkan keyword multi-kata terhadap pesan pengguna.
 * Strategi:
 *  1. Exact substring match.
 *  2. Semua kata keyword muncul (substring) dalam pesan.
 *  3. Skor kemiripan kata terbaik per kata keyword rata-rata >= threshold.
 */
export function matchKeyword(keyword: string, message: string, threshold: number): number {
    const kw = normalize(keyword)
    const msg = normalize(message)

    // 1. Exact substring
    if (msg.includes(kw)) return 1.0

    const kwWords = kw.split(/\s+/).filter(Boolean)
    const msgWords = msg.split(/\s+/).filter(Boolean)

    // 2. Semua kata keyword ada dalam pesan (sebagai substring)
    const allExact = kwWords.every(w => msgWords.some(mw => mw.includes(w) || w.includes(mw)))
    if (allExact && kwWords.length > 0) return 0.95

    // 3. Rata-rata skor kemiripan terbaik per kata keyword
    if (kwWords.length === 0 || msgWords.length === 0) return 0

    const scores = kwWords.map(kWord => {
        const best = msgWords.reduce((max, mWord) => {
            const s = similarity(kWord, mWord)
            return s > max ? s : max
        }, 0)
        return best
    })

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return avg >= threshold ? avg : 0
}

function normalize(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim()
}