import { useEffect, useMemo, useRef } from "react"
import { Row } from "../graphql/generated"
import { ChoiceAnswerField, Field } from "../lib/schema/fields"
import Schema from "../lib/schema/Schema"
import { Column, RowField } from "./Table"
import TableRowInput from "./TableRowInput"
import { Line } from "./TableBody"

export type RowSelectionState = {
    isSelected: boolean,
    doSelect: (shift: boolean) => void,
    doDeselect: (shift: boolean) => void,
}

export default function TableRow({edit, schema, line, setLineData, columns, selectionState, focusColumnName,showStandardAnswers, onCellClick}:{
    edit: boolean,
    schema: Schema,
    line: Line,
    setLineData: (field_name: string, value: string | undefined) => void,
    columns: Column[],
    selectionState: RowSelectionState,
    focusColumnName: string,
    showStandardAnswers: boolean,
    onCellClick: (column: Column) => void
}) {
    // memoized setters per ogni campo
    // evita che il setter venga ricreato ad ogni render
    // e rende stabile il riferimento della colonna
    const setters = useMemo(() => {
      const map: Record<string, (v: string | undefined) => void> = {};
      for (const field of columns.filter(col => col instanceof Field)) {
        map[field.name] = (newValue) => {
          console.log(`setter for field ${field.name} called with value ${newValue}`);
          return setLineData(field.name, newValue) }
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
    const EMPTY_DATA = columns.filter(c => c instanceof Field).map(c => [c.name,''])
    const oldData = line.row ? line.row.data : EMPTY_DATA
    const newData = {...oldData, ...line.data}
    
    return <tr className={`${className} clickable ${hasFocus ? 'focus' : ''}`} style={style} onKeyDown={onKeyDown}>
        <CheckboxCell selectionState={selectionState} hasFocus={!!focusColumnName} />
        {columns.map(column => (column instanceof Field) 
        ? <DataCell 
            key={column.name} field={column} 
            edit={edit} hasFocus={focusColumnName === column.name} 
            newValue={newData[column.name]} oldValue={oldData[column.name]}
            setNewValue={setters[column.name]}  
            showStandardAnswers={showStandardAnswers} 
            onClick={() => onCellClick(column)}
            moveLeft={() => moveLeft()} moveRight={() => moveRight()}
            />
        : <InfoCell key={column.name} line={line} column={column}/>
        )}
        { (line.error || line?.row?.olimanager?.error) && <td className="alert">{line.error || line?.row?.olimanager?.error}</td>}
        { line.row && line?.row?.olimanager?.participantId && <td className="olimanager-participant-id">oli={line.row.olimanager.participantId} sync={line.row.olimanager.resultsUpdatedOn?"1":"0"}</td>}
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

    function moveLeft() {
      const currentIndex = columns.findIndex(col => col.name === focusColumnName);
      if (currentIndex < 1) return false;
      const prevCol = columns[currentIndex - 1];
      onCellClick(prevCol);
      return true
    }

    function moveRight() {
      const currentIndex = columns.findIndex(col => col.name === focusColumnName);
      if (currentIndex < 0 || currentIndex >= columns.length - 1) return false;
      const nextCol = columns[currentIndex + 1];
      onCellClick(nextCol);
      return true;
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {   
        if (!focusColumnName) return;
        if (e.key === 'ArrowLeft') {
          if (moveLeft()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        } else if (e.key === 'ArrowRight') {
          if (moveRight()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        } else if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (moveLeft()) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          } else {
            if (moveRight()) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
    }
}

function CheckboxCell({selectionState, hasFocus}:{
    selectionState: RowSelectionState
    hasFocus: boolean
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

function InfoCell({line, column}:{
    line: Line,
    column: RowField
}) {
    const value = line.row ? line.row[column.name as keyof Row] || '' : '';
    return <td className={column.name}>
        {(line.row && column.value_formatter) ? column.value_formatter({row: line.row,value}) : value}
    </td>
}

function DataCell({edit, hasFocus, field, oldValue, newValue, setNewValue, showStandardAnswers, onClick, moveLeft, moveRight}:{
  edit: boolean,
  hasFocus: boolean,
  field: Field,
  oldValue: string, // valore originale
  newValue: string, // valore eventualmente modificato
  setNewValue: (newValue: string|undefined) => void,
  showStandardAnswers: boolean,
  onClick: () => void,
  moveLeft: () => boolean,
  moveRight: () => boolean,
}) {
  let extra_css="";
  let correct_value = undefined;
  let title = newValue;
  let value = newValue;
  if (field instanceof ChoiceAnswerField) {
    oldValue = oldValue.charAt(0);
    if (value?.length === 7) {
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
      title = (value === correct_value) ? value : `${value} (invece di ${correct_value})`;
    }
  }
  if (showStandardAnswers && field.name === 'variant') {
    if (value.length === 3) {
    // mostra il codice della variante standard
      value = `›${value.charAt(0)}11‹` 
    }
  }

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  const className = `${field.css_class} ${extra_css} ${hasFocus ? 'focus' : ''} ${value !== oldValue ? 'modified' : ''}`;

  return <td title={title} className={className} onClick={onClick} style={style}>
      {hasFocus 
        ? <TableRowInput 
            field={field}
            value={value} setValue={setNewValue} 
            oldValue={oldValue}
            moveLeft={moveLeft} moveRight={moveRight}
          />
        : value}
  </td>
}
