import { Dispatch, KeyboardEvent, RefObject, SetStateAction, useMemo } from "react"
import { Field } from "../lib/schema/fields"
import { Column } from "./Table"
import { CheckboxCell, DataCell, InfoCell } from "./TableRowCell"
import { Line } from "./Table"

export type RowSelectionState = {
    isSelected: boolean,
    doSelect: (shift: boolean) => void,
    doDeselect: (shift: boolean) => void,
}

export default function TableRow({line, setLineData, columns, selectionState, focusColumnName, inputFocus, directInput, setDirectInput, showStandardAnswers, onCellClick, cellKeyDownHandler, moveRightOrLeft}:{
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
    moveRightOrLeft: (n: number) => boolean,
}) {
    // memoized setters per ogni campo
    // evita che il setter venga ricreato ad ogni render
    // e rende stabile il riferimento della colonna
    const setters = useMemo(() => {
      const map: Record<string, (v: string | undefined) => void> = {};
      for (const field of columns.filter(col => col instanceof Field)) {
        map[field.name] = (newValue) => {
          // console.log(`setter for field ${field.name} called with value ${newValue}`);
          return setLineData(field.name, newValue) 
        }
      }
      return map;
    }, [setLineData, columns]);

    const {className, style } = computeRecentFadeStyling();

    /*
    // Effetto per gestire il focus dell'input quando si entra in modalità modifica
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (focusColumnName && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [focusColumnName]);
    */

    const hasFocus = focusColumnName != ''
    const modified: boolean = Object.keys(line.data).length > 0;
    const EMPTY_DATA = useMemo(() => columns.filter(c => c instanceof Field).map(c => [c.name,'']), [columns])
    const oldData = useMemo(() => line.row ? line.row.data : EMPTY_DATA, [line.row, EMPTY_DATA])
    const newData = {...oldData, ...line.data}
    
    return <tr className={`${className} clickable ${hasFocus ? 'focus' : ''}`} style={style}>
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
            />
        : <InfoCell key={column.name} line={line} column={column}/>
        )}
        { (line?.row?.error || line?.row?.olimanager?.error) && <td className="alert hide-print">{line.row?.error || line.row?.olimanager?.error}</td>}
        { line.row && line?.row?.olimanager?.participantId && <td className="olimanager-participant-id hide-print">oli={line.row.olimanager.participantId} sync={line.row.olimanager.resultsUpdatedOn?"1":"0"}</td>}
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

