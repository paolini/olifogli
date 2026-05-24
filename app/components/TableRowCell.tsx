import { useEffect, useRef } from "react"
import type { ChangeEvent, Dispatch, FocusEvent, KeyboardEvent, RefObject, SetStateAction } from "react"
import { Field } from "../lib/schema/fields"
import { Line, RowField } from "./Table";
import { Row } from "../graphql/generated";
import { RowSelectionState } from "./TableRow";
import { RowValidationContext } from "../lib/schema/Context";

export function CheckboxCell({selectionState}:{
    selectionState: RowSelectionState
}) {
    const { isSelected, doSelect, doDeselect } = selectionState;
    return <td className="checkbox-cell hide-print">
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

export function DataCell({hasFocus, inputFocus, field, oldValue, newValue, setNewValue, directInput, setDirectInput, showStandardAnswers, onClick, cellKeyDownHandler, validationContext, cursorColor}:{
  hasFocus: boolean,
  inputFocus: boolean,
  field: Field,
  oldValue: string, // valore originale
  newValue: string, // valore eventualmente modificato
  setNewValue: null|((newValue: string|undefined) => void), // può essere null se il campo non è modificabile
  directInput: boolean,
  setDirectInput: Dispatch<SetStateAction<boolean>>,
  showStandardAnswers: boolean,
  onClick: () => void,
  cellKeyDownHandler: (e: KeyboardEvent<HTMLInputElement>) => void,
  validationContext: RowValidationContext,
  cursorColor?: string,
}) {
  const tdRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
    
  useEffect(() => {
    if (!hasFocus) return;
    if (inputRef.current && inputFocus) {
        inputRef.current.focus();
        // console.log(`DataCell: focusing input for field ${field.name} with directInput=${directInput} value=${inputRef.current.value}`);
        inputRef.current.select();
    } 
    if (tdRef.current && !inputFocus) {
        tdRef.current?.focus();
    }
  }, [inputFocus, hasFocus, tdRef]);

  useEffect(() => {
    if (hasFocus && directInput && inputRef.current) {
        // console.log(`DataCell: directInput effect focusing input for field ${field.name}`);
        inputRef.current.focus();
        // rimuovi la selezione:
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
        setDirectInput(false);
    }
  }, [hasFocus, directInput, setDirectInput]);

  // useEffect(() => {}, [inputRef.currentkeyStrokeBuffer,setKeyStrokeBuffer]);
  
  const {value, extra_css, title, changed} = field.display(newValue, oldValue, showStandardAnswers);

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  const anomalous = field.anomalous(value, validationContext);

  const className = `${field.css_class}${extra_css?` ${extra_css}` : ''}${hasFocus ? ' focus' : ''}${inputFocus && hasFocus ? ' input-focus' : ''}${changed ? ' modified' : ''}${anomalous ? ' anomalous' : ''}`;

  return <td className={className} tabIndex={1} title={title} onClick={onClick} style={cursorColor ? {...style, boxShadow: `inset 0 0 0 2px ${cursorColor}`} : style} ref={tdRef}>
      {(hasFocus && field.editable && inputFocus && setNewValue)
        ? <TableCellInput 
            field={field}
            value={value} setValue={setNewValue} 
            oldValue={oldValue}
            cellKeyDownHandler={cellKeyDownHandler}
            inputRef={inputRef}
          />
        : value}
  </td>
}

export default function TableCellInput({field, value, setValue, oldValue, cellKeyDownHandler, inputRef}:{
    field: Field,
    value: string,
    oldValue: string,
    setValue: (newValue: string|undefined) => void,
    cellKeyDownHandler: (e: KeyboardEvent<HTMLInputElement>) => void,
    inputRef: RefObject<HTMLInputElement|null>
}) {

    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={cellKeyDownHandler}
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
        const {changed} = field.display(cleaned, oldValue, false)
        setValue(changed ? cleaned : undefined)
    }

    function onChange(e: ChangeEvent<HTMLInputElement>) {
        // console.log(`TableRowInput onChange for field ${field.name} with value: ${e.currentTarget.value}`);
        const value = e.currentTarget.value
        const {changed} = field.display(value, oldValue, false)
        setValue(changed ? value : undefined)
    }

    function onBlur(e: FocusEvent<HTMLInputElement>) {
        // console.log(`TableRowInput onBlur for field ${field.name} with value: ${e.currentTarget.value}`);
        cleanAndSet(e.currentTarget.value)
    }
}