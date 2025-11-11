import { useEffect, useRef } from "react"
import type { ChangeEvent, FocusEvent, RefObject } from "react"
import { ChoiceAnswerField, Field } from "../lib/schema/fields"
import { Line, RowField } from "./Table";
import { Row } from "../graphql/generated";
import { RowSelectionState } from "./TableRow";
import { typeDefs } from "../graphql/typedefs";

export function CheckboxCell({selectionState}:{
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

export function InfoCell({line, column}:{
    line: Line,
    column: RowField
}) {
    const value = line.row ? line.row[column.name as keyof Row] || '' : '';
    return <td className={column.name}>
        {(line.row && column.value_formatter) ? column.value_formatter({row: line.row,value}) : value}
    </td>
}

export function DataCell({isEditing, hasFocus, field, oldValue, newValue, setNewValue, showStandardAnswers, onClick, cellKeyDown, inputRef}:{
  isEditing: boolean,
  hasFocus: boolean,
  field: Field,
  oldValue: string, // valore originale
  newValue: string, // valore eventualmente modificato
  setNewValue: (newValue: string|undefined) => void,
  showStandardAnswers: boolean,
  onClick: () => void,
  cellKeyDown: (key: string, input: HTMLInputElement, preventDefault: () => void, stopPropagation: () => void) => void,
  inputRef: RefObject<HTMLInputElement | null>,
}) {
  const tdRef = useRef<HTMLTableCellElement>(null);
    
  useEffect(() => {
    if (hasFocus && isEditing && inputRef.current) {
        inputRef.current.focus();
        //inputRef.current.select();
    }
  }, [hasFocus, isEditing, inputRef]);
  
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

  return <td title={title} className={className} onClick={onClick} style={style} ref={tdRef}>
      {hasFocus && isEditing
        ? <TableCellInput 
            field={field}
            value={value} setValue={setNewValue} 
            oldValue={oldValue}
            cellKeyDown={cellKeyDown}
            inputRef={inputRef}
          />
        : value}
  </td>
}

export default function TableCellInput({field, value, setValue, oldValue, cellKeyDown, inputRef}:{
    field: Field,
    value: string,
    oldValue: string,
    setValue: (newValue: string|undefined) => void
    cellKeyDown: (key: string, input: HTMLInputElement, preventDefault: () => void, stopPropagation: () => void) => void,
    inputRef: RefObject<HTMLInputElement | null>,
}) {
    const lastValueRef = useRef(value);

    useEffect(() => {
        const input = inputRef.current
        if (input) {
            input.focus()
            //input.select()
        }
    }, [inputRef])

    useEffect(() => {
        lastValueRef.current = value;
    }, [value]);

    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={e => cellKeyDown(e.key, e.currentTarget, () => e.preventDefault(), () => e.stopPropagation())}
        onFocus={onFocus}
    />

    function onFocus(e: FocusEvent<HTMLInputElement>) {
        // console.log(`TableRowInput onFocus for field ${field.name}`);
        if (field.type === 'choice-answer') {
            e.target.select()
        }
    }

    function cleanAndSet(value: string) {
        // console.log(`TableRowInput cleanAndSet for field ${field.name} with value: ${value}`);
        const cleaned = field.clean(value)
        setValue(cleaned === oldValue ? undefined : cleaned)
    }

    function onChange(e: ChangeEvent<HTMLInputElement>) {
        // console.log(`TableRowInput onChange for field ${field.name} with value: ${e.currentTarget.value}`);
        const value = e.currentTarget.value
        setValue(value === oldValue ? undefined : value)
    }

    function onBlur(e: FocusEvent<HTMLInputElement>) {
        // console.log(`TableRowInput onBlur for field ${field.name} with value: ${e.currentTarget.value}`);
        cleanAndSet(e.currentTarget.value)
    }
}