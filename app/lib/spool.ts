import { mkdir, rename, rm, writeFile } from 'fs/promises'
import path from 'path'

export type StagedSpoolFile = {
    /** Makes the file visible to the worker under its final name. */
    publish: () => Promise<void>
    /** Removes the staged file; safe to call when it no longer exists. */
    discard: () => Promise<void>
}

/*
 * The archiomr workers (oliscan, olisheet) poll their spool directory and take
 * any file with the expected extension. Writing the final name directly lets a
 * worker read a partially written file, so the content is written under a
 * `.part` name, which the workers ignore, and renamed once complete.
 * The rename is atomic because both names are in the same directory.
 */
export async function stageSpoolFile(dir: string, filename: string, data: string | Uint8Array): Promise<StagedSpoolFile> {
    // Runtime volumes, not build assets to include in the standalone image.
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true })
    const finalPath = path.join(dir, filename)
    const partPath = `${finalPath}.part`
    try {
        await writeFile(/* turbopackIgnore: true */ partPath, data)
    } catch (error) {
        await rm(/* turbopackIgnore: true */ partPath, { force: true })
        throw error
    }
    return {
        publish: () => rename(/* turbopackIgnore: true */ partPath, /* turbopackIgnore: true */ finalPath),
        discard: () => rm(/* turbopackIgnore: true */ partPath, { force: true }),
    }
}
