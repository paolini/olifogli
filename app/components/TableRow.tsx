import { useEffect, useRef } from "react"
import { Row } from "../graphql/generated"
import { ChoiceAnswerField, Field } from "../lib/schema/fields"
import Schema from "../lib/schema/Schema"
import { Column, RowField } from "./Table"
import TableRowInput from "./TableRowInput"
import { RowModifiedData } from "./TableBody"

export type RowSelectionState = {
    isSelected: boolean,
    doSelect: (shift: boolean) => void,
    doDeselect: (shift: boolean) => void,
}

export default function TableRow({edit, schema, row, columns, focusColumnName, modifiedData, selectionState, showStandardAnswers, onCellClick}:{
    edit: boolean,
    schema: Schema,
    row: Row,
    columns: Column[],
    focusColumnName: string,
    modifiedData?: RowModifiedData,
    selectionState: RowSelectionState,
    showStandardAnswers: boolean,
    onCellClick: (column: Column) => void
}) {
    const {className, style } = computeRecentFadeStyling();
    
    // Effetto per gestire il focus dell'input quando si entra in modalità modifica
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (focusColumnName && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [focusColumnName]);

    return <tr className={`${className} clickable`} style={style} onKeyDown={onKeyDown}>
        <CheckboxCell selectionState={selectionState} />
        {columns.map(column => (column instanceof Field) 
        ? <DataCell edit={edit} hasFocus={focusColumnName === column.name} rowModifiedData={rowModifiedData} key={column.name} field={column} value={row.data[column.name]} showStandardAnswers={showStandardAnswers} onClick={() => onCellClick(column)} inputRef={inputRef}/>
        : <InfoCell key={column.name} row={row} column={column}/>
        )}
        {(row.error || row?.olimanager?.error) && <td className="alert">{row.error || row?.olimanager?.error}</td>}
        {(row?.olimanager?.participantId) && <td className="olimanager-participant-id">oli={row.olimanager.participantId} sync={row.olimanager.resultsUpdatedOn?"1":"0"}</td>}
    </tr>

    function computeRecentFadeStyling() {
        // Calcola quanto tempo è passato dall'ultimo aggiornamento
        const timeSinceUpdate = row.updatedOn ? Date.now() - new Date(row.updatedOn).getTime() : Infinity
        const isRecent = timeSinceUpdate < 60000
        const elapsedTime = isRecent ? timeSinceUpdate / 1000 : 0 // tempo già trascorso in secondi
    
        const className = `${isRecent ? "recently-added" : ""}`
        const style = isRecent ? { 
            '--fade-delay': `-${elapsedTime}s` 
        } as React.CSSProperties : undefined
        return { className, style }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {   
        if (!focusColumnName) return;
        if (e.key === 'ArrowLeft') {
            const currentIndex = columns.findIndex(col => col.name === focusColumnName);
            if (currentIndex > 0) {
                e.preventDefault();
                e.stopPropagation
                const prevCol = columns[currentIndex - 1];
                onCellClick(prevCol);
                return;
            } 
        } else if (e.key === 'ArrowRight') {
            const currentIndex = columns.findIndex(col => col.name === focusColumnName);
            if (currentIndex < columns.length - 1) {
                e.preventDefault();
                e.stopPropagation
                const nextCol = columns[currentIndex + 1];
                onCellClick(nextCol);
                return;
            }
        }
    }
}

function CheckboxCell({selectionState}:{
    selectionState: RowSelectionState
}) {
    const { isSelected, doSelect, doDeselect } = selectionState;
    return <td className="checkbox-cell">
      <input 
        type="checkbox" 
        checked={isSelected}
        onChange={onChange}
      />
    </td>

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        // nativeEvent può essere MouseEvent o InputEvent, ma shiftKey è solo su MouseEvent
        const native = e.nativeEvent
        const shift = 'shiftKey' in native && typeof native.shiftKey === 'boolean' ? native.shiftKey : false
        const checked = e.currentTarget.checked
        if (checked) doSelect(shift)
        else doDeselect(shift)
    }
}

function InfoCell({row, column}:{
    row: Row,
    column: RowField
}) {
    let value = row[column.name as keyof Row] || '';
    return <td className={column.name}>
        {column.value_formatter ? column.value_formatter({row,value}) : value}
    </td>
}

function DataCell({edit, hasFocus, rowModifiedData, field, value, showStandardAnswers, onClick, inputRef}:{
  edit: boolean,
  hasFocus: boolean,
  rowModifiedData?: RowModifiedData,
  field: Field,
  value: string,
  showStandardAnswers: boolean,
  onClick: () => void,
  inputRef: React.RefObject<HTMLInputElement|null>
}) {
  let extra_css="";
  let correct_value = undefined;
  let title = value;
  if (field instanceof ChoiceAnswerField) {
    if (value.length === 7) {
      // showStandardAnswers decides whether to show 
      // the corresponding answers in the standard permutation (211/311)
      correct_value = showStandardAnswers ? value.charAt(5) : value.charAt(3)
      value = showStandardAnswers ? value.charAt(4) : value.charAt(0);
      extra_css = value === correct_value
        ? "correct"
        : value === '-' 
          ? "empty" 
            : ["A", "B", "C", "D", "E"].includes(value) 
              ? "incorrect" 
              : "invalid";
      title = value === correct_value ? value : `${value} (invece di ${correct_value})`;
    }
  }
  if (showStandardAnswers &&field.name === 'variant') {
    if (value.length === 3) {
    // mostra il codice della variante standard
      value = `›${value.charAt(0)}11‹` 
    }
  }

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  const className = `${field.css_class} ${extra_css} ${hasFocus ? 'focus' : ''}`;

  return <td title={title} className={className} onClick={onClick} style={style}>
      {hasFocus ? <TableRowInput inputRef={inputRef} value={value} setValue={setValue}/> : value}
  </td>

  function setValue(newValue: string) {
    if (!rowModifiedData) return;
    const old
    if (field.name in rowModifiedData || newValue !== value) {
        rowModifiedData[field.name] = newValue;
    }
  }
}
