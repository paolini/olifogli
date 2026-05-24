import { Dispatch, KeyboardEvent, SetStateAction, useMemo } from "react"
import { ChoiceAnswerField, Field } from "../lib/schema/fields"
import { Column } from "./Table"
import { CheckboxCell, DataCell, InfoCell } from "./TableRowCell"
import { Line } from "./Table"
import { RowValidationContext } from "../lib/schema/Context"

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

export default function TableRow({line, setLineData, columns, selectionState, focusColumnName, inputFocus, directInput, setDirectInput, showStandardAnswers, onCellClick, cellKeyDownHandler, adminEditMode, validationContext, cursorUsers}:{
    line: Line,
    setLineData: (field_name: string, value: string | undefined) => void,
    columns: Column[],
    selectionState: RowSelectionState,
    focusColumnName: string,
    inputFocus: boolean,
    directInput: boolean,
    setDirectInput: Dispatch<SetStateAction<boolean>>,
    showStandardAnswers: boolean,
    onCellClick: (column: Column) => void,
    cellKeyDownHandler: (e: KeyboardEvent<HTMLInputElement>) => void,
    adminEditMode: boolean,
    validationContext: RowValidationContext,
    cursorUsers?: Array<{ email: string, fieldName: string | null }>,
}) {
    // memoized setters per ogni campo
    // evita che il setter venga ricreato ad ogni render
    // e rende stabile il riferimento della colonna
    const setters = useMemo(() => {
      const map: Record<string, null | ((v: string | undefined) => void)> = {};
      for (const field of columns.filter(col => col instanceof Field)) {
        if (line?.row?.olimanager?.participantId 
                && ["name","surname","birthDate","classYear","classSection","gender"].includes(field.name)
                && !adminEditMode
            ) {
            // campo non modificabile perché già sincronizzato da Olimanager
            map[field.name] = null
        } else if (showStandardAnswers && field instanceof ChoiceAnswerField) {
            // campo non modificabile in modalità showStandardAnswers
            map[field.name] = null
        } else {
            map[field.name] = (newValue) => {
            // console.log(`setter for field ${field.name} called with value ${newValue}`);
            return setLineData(field.name, newValue) 
            }
        }
      }
      return map;
    }, [setLineData, columns]);

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
    const EMPTY_DATA = useMemo(() => columns.filter(c => c instanceof Field).map(c => [c.name,'']), [columns])
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
            inputFocus={inputFocus}
            newValue={newData[column.name] || ''} oldValue={oldData[column.name] || ''}
            setNewValue={setters[column.name]}
            directInput={directInput}
            setDirectInput={setDirectInput}
            showStandardAnswers={showStandardAnswers} 
            onClick={() => onCellClick(column)}
            cellKeyDownHandler={cellKeyDownHandler}
            validationContext={validationContext}
            cursorColor={cursorColorByField[column.name]}
            />
        : <InfoCell key={column.name} line={line} column={column}/>
        )}
        { (line?.row?.error || line?.row?.olimanager?.error) 
            ? <td className="alert hide-print">{line.row?.error || line.row?.olimanager?.error}</td>
            : <td>✓</td>
        }
        { line.row && line?.row?.olimanager?.participantId && <td title={`Olimanager participant_id: ${line.row.olimanager.participantId}, results_updated_on: ${line.row.olimanager.resultsUpdatedOn}`} className="olimanager-participant-id hide-print">participantId={line.row.olimanager.participantId} contestId={line.row.olimanager.contestId} results={line.row.olimanager.resultsUpdatedOn?"1":"0"}</td>}
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

