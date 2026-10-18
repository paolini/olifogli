import { useRef, useState } from 'react'
import { Field } from '../lib/schema/fields'
import type { Row } from '../graphql/generated'

export function canEditCell(field: Field, row: Row | undefined, adminEditMode: boolean, standardAnswers: boolean): boolean {
    if (!field.editable || (standardAnswers && field.type === 'choice-answer')) return false
    return !row?.olimanager?.participantId || adminEditMode ||
        !['name', 'surname', 'birthDate', 'classYear', 'classSection', 'gender'].includes(field.name)
}

export type EditorSelection = 'all' | { start: number, end: number } | null
export type CellEditorState = { mode: 'navigation' } | {
    mode: 'editing'
    lineKey: string
    field: Field
    value: string
    selection: EditorSelection
    error: string
    focusRequest: number
}

export type CellCommitResult<T> = { ok: true, value: T | undefined } | { ok: false }

// The draft belongs to a cell, not to a pending row save. The ref also makes
// begin -> character -> commit a single synchronous action for answer cells.
export default function useCellEditor<T>(
    onCommit: (lineKey: string, field: Field, value: string) => T,
    validate: (lineKey: string, field: Field, value: string) => string,
) {
    const [editor, setEditor] = useState<CellEditorState>({ mode: 'navigation' })
    const current = useRef(editor)

    function update(next: CellEditorState) {
        current.current = next
        setEditor(next)
    }

    function begin(lineKey: string, field: Field, value: string, selectAll = true) {
        update({ mode: 'editing', lineKey, field, value, error: '', focusRequest: 0,
            selection: selectAll ? 'all' : { start: value.length, end: value.length } })
    }

    function change(value: string) {
        const draft = current.current
        if (draft.mode === 'editing') update({ ...draft, value, error: '', selection: null })
    }

    function reset() { update({ mode: 'navigation' }) }

    function key(key: string, start: number, end: number) {
        const draft = current.current
        if (draft.mode !== 'editing') return
        const result = draft.field.editKey(key, draft.value, start, end)
        if (result && 'rejected' in result) return result
        if (result) update({ ...draft, value: result.value, error: '',
            selection: { start: result.cursor, end: result.cursor } })
        return result
    }

    function commit({ keepEditing = false, preserveDraft = false, expected }: {
        keepEditing?: boolean,
        preserveDraft?: boolean,
        expected?: { lineKey: string, fieldName: string },
    } = {}): CellCommitResult<T> {
        const draft = current.current
        if (draft.mode !== 'editing') return { ok: true, value: undefined }
        if (expected && (draft.lineKey !== expected.lineKey || draft.field.name !== expected.fieldName)) return { ok: true, value: undefined }
        const error = validate(draft.lineKey, draft.field, draft.value)
        if (error) {
            update({ ...draft, error, focusRequest: draft.focusRequest + (preserveDraft ? 0 : 1) })
            return { ok: false }
        }
        const value = draft.field.clean(draft.value)
        const result = onCommit(draft.lineKey, draft.field, value)
        if (!preserveDraft) update(keepEditing ? { ...draft, value, error: '', selection: null } : { mode: 'navigation' })
        return { ok: true, value: result }
    }

    return { editor, begin, change, key, commit, reset }
}
