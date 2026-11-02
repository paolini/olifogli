import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { OlimanagerJob, OlimanagerJobCredential } from './models'

export type DelegatedOlimanagerAccess = { accessToken: string, expiresAt: number }
function key(secret: string | undefined) {
    if (!secret) throw new Error('Configurare NEXTAUTH_SECRET anche nel worker Olifogli.')
    return Buffer.from(hkdfSync('sha256', secret, '', 'olifogli:olimanager-job-access:v1', 32))
}
function binding(job: OlimanagerJob) {
    return Buffer.from(JSON.stringify([1, job._id.toString(), job.createdBy.toString(), job.endpoint]))
}
export function protectJobAccess(job: OlimanagerJob, access: DelegatedOlimanagerAccess, secret = process.env.NEXTAUTH_SECRET): OlimanagerJobCredential {
    if (!access.accessToken || !Number.isFinite(access.expiresAt) || access.expiresAt <= Date.now() / 1000) {
        throw new Error('Token Olimanager scaduto o scadenza non disponibile: rifare il login.')
    }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
    cipher.setAAD(binding(job))
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(access), 'utf8'), cipher.final()])
    return { _id: job._id, iv: iv.toString('base64'), ciphertext: encrypted.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'), expiresAt: new Date(access.expiresAt * 1000) }
}
export function unprotectJobAccess(job: OlimanagerJob, credential: OlimanagerJobCredential, secret = process.env.NEXTAUTH_SECRET): DelegatedOlimanagerAccess {
    try {
        if (!credential._id.equals(job._id)) throw new Error()
        const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(credential.iv, 'base64'))
        decipher.setAAD(binding(job))
        decipher.setAuthTag(Buffer.from(credential.tag, 'base64'))
        const access = JSON.parse(Buffer.concat([decipher.update(Buffer.from(credential.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
        if (typeof access.accessToken !== 'string' || !access.accessToken || !Number.isFinite(access.expiresAt) ||
            access.expiresAt * 1000 !== credential.expiresAt.getTime()) throw new Error()
        return access
    } catch { throw new Error('Impossibile leggere la delega OAuth del job: verificare NEXTAUTH_SECRET di app e worker.') }
}
