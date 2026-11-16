import type { CellEditorState } from './useCellEditor'
import { useMemo } from "react"
import { Field } from "../lib/schema/fields"
import { Column } from "./Table"
import { CheckboxCell, DataCell, InfoCell } from "./TableRowCell"
import { Line } from "./Table"
import { RowValidationContext } from "../lib/schema/Context"
import { Check, Cloud, CloudAlert, X } from "lucide-react"
import type { OlimanagerRowData } from "../graphql/generated"
import { myTimestamp } from "../lib/util"

export type RowSelectionState = {
    isSelected: boolean,
    doSelect: (shift: boolean) => void,
    doDeselect: (shift: boolean) => void,
}

function emailToColor(email: string): string {
    let hash = 0
    for (let i = 0; i < email.length; i++) {
        hash = (hash * 31 + email.charCodeAt(i)) & 0x7fffffff
    }
    return `hsl(${hash % 360}, 70%, 45%)`
}

export default function TableRow({line, columns, selectionState, focusColumnName, editor, onEditorChange, onEditorBlur, showStandardAnswers, onCellClick, validationContext, cursorUsers}:{
    line: Line,
    columns: Column[],
    selectionState: RowSelectionState,
    focusColumnName: string,
    editor: CellEditorState,
    onEditorChange: (value: string) => void,
    onEditorBlur: (lineKey: string, fieldName: string) => void,
    showStandardAnswers: boolean,
    onCellClick: (column: Column) => void,
    validationContext: RowValidationContext,
    cursorUsers?: Array<{ email: string, fieldName: string | null }>,
}) {
    const {className, style } = computeRecentFadeStyling();

    const hasFocus = focusColumnName != ''
    const cursorColorByField: Record<string, string> = {}
    if (cursorUsers) {
        for (const u of cursorUsers) {
            if (u.fieldName && !(u.fieldName in cursorColorByField)) {
                cursorColorByField[u.fieldName] = emailToColor(u.email)
            }
        }
    }
    const anyCursorColor = cursorUsers && cursorUsers.length > 0 ? emailToColor(cursorUsers[0].email) : undefined
    const EMPTY_DATA = useMemo(() => Object.fromEntries(columns.filter(c => c instanceof Field).map(c => [c.name,''])), [columns])
    const oldData = useMemo(() => line.row ? line.row.data : EMPTY_DATA, [line.row, EMPTY_DATA])
    const newData = {...oldData, ...line.data}
    
    return <tr 
        className={`${className} clickable ${hasFocus ? 'focus' : ''}`} 
        style={anyCursorColor ? {...style, boxShadow: `inset 4px 0 0 0 ${anyCursorColor}`} : style}
        title={cursorUsers && cursorUsers.length > 0 ? `In uso da: ${cursorUsers.map(u => u.email).join(', ')}` : undefined}
    >
        <CheckboxCell selectionState={selectionState} />
        {columns.map(column => (column instanceof Field) 
        ? <DataCell 
            key={column.name} field={column} 
            hasFocus={focusColumnName === column.name} 
            editor={editor.mode === 'editing' && editor.lineKey === line.key && editor.field.name === column.name ? editor : undefined}
            onEditorChange={onEditorChange}
            onEditorBlur={() => onEditorBlur(line.key, column.name)}
            newValue={newData[column.name] || ''} oldValue={oldData[column.name] || ''}
            showStandardAnswers={showStandardAnswers} 
            onClick={() => onCellClick(column)}
            validationContext={validationContext}
            cursorColor={cursorColorByField[column.name]}
            />
        : <InfoCell key={column.name} line={line} column={column}/>
        )}
        <td className="row-status-cell">
            <RowValidationIcon error={line.row?.error} />
            <RowSyncIcon olimanager={line.row?.olimanager} />
        </td>
    </tr>

    function computeRecentFadeStyling() {
        // Calcola quanto tempo è passato dall'ultimo aggiornamento
        const timeSinceUpdate = line?.row?.updatedOn ? Date.now() - new Date(line.row.updatedOn).getTime() : Infinity
        const isRecent = timeSinceUpdate < 60000
        const elapsedTime = isRecent ? timeSinceUpdate / 1000 : 0 // tempo già trascorso in secondi
    
        const className = `${isRecent ? "recently-added" : ""}`
        const style = isRecent ? { 
            '--fade-delay': `-${elapsedTime}s` 
        } as React.CSSProperties : undefined
        return { className, style }
    }
}


function RowValidationIcon({error}: {error?: string | null}) {
    if (error) return <span className="row-status-icon row-status-error" title={error}>
        <X size={16} aria-label={error} />
    </span>
    return <span className="row-status-icon row-status-ok" title="Riga valida">
        <Check size={16} aria-label="Riga valida" />
    </span>
}

function RowSyncIcon({olimanager}: {olimanager?: OlimanagerRowData | null}) {
    if (!olimanager) return null
    const {participantId, contestId, error, resultsUpdatedOn} = olimanager
    if (!participantId && !error) return null
    const info = [
        participantId && `Olimanager participant_id: ${participantId}`,
        contestId && `contest_id: ${contestId}`,
        participantId && `risultati inviati: ${resultsUpdatedOn ? myTimestamp(resultsUpdatedOn) : 'mai'}`,
    ].filter(Boolean).join('\n')
    if (error) {
        const title = info ? `${error}\n${info}` : error
        return <span className="row-status-icon row-status-error hide-print" title={title}>
            <CloudAlert size={16} aria-label={title} />
        </span>
    }
    return <span className={`row-status-icon hide-print ${resultsUpdatedOn ? 'row-status-ok' : 'row-status-pending'}`} title={info}>
        <Cloud size={16} aria-label={info} />
    </span>
}
