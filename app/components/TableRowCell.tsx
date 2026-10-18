import { useLayoutEffect, useRef } from "react"
import type { CellEditorState } from "./useCellEditor"
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

export function DataCell({hasFocus, field, oldValue, newValue, editor, onEditorChange, onEditorBlur, showStandardAnswers, onClick, validationContext, cursorColor}:{
  hasFocus: boolean,
  field: Field,
  oldValue: string, // valore originale
  newValue: string, // valore eventualmente modificato
  editor?: Extract<CellEditorState, { mode: 'editing' }>,
  onEditorChange: (value: string) => void,
  onEditorBlur: () => void,
  showStandardAnswers: boolean,
  onClick: () => void,
  validationContext: RowValidationContext,
  cursorColor?: string,
}) {
  const tdRef = useRef<HTMLTableCellElement>(null);
  useLayoutEffect(() => {
    if (hasFocus && !editor) tdRef.current?.focus()
  }, [hasFocus, !!editor])

  const {value, extra_css, title, changed} = field.display(editor?.value ?? newValue, oldValue, showStandardAnswers);

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  const anomalous = field.anomalous(value, validationContext);

  const className = `${field.css_class}${extra_css?` ${extra_css}` : ''}${hasFocus ? ' focus' : ''}${editor && hasFocus ? ' input-focus' : ''}${changed ? ' modified' : ''}${anomalous ? ' anomalous' : ''}`;

  return <td className={className} tabIndex={1} title={title} onClick={onClick} style={cursorColor ? {...style, boxShadow: `inset 0 0 0 2px ${cursorColor}`} : style} ref={tdRef}>
      {editor
        ? <TableCellInput editor={editor} onChange={onEditorChange} onBlur={onEditorBlur} />
        : value}
  </td>
}

export default function TableCellInput({editor, onChange, onBlur}: {
    editor: Extract<CellEditorState, { mode: 'editing' }>,
    onChange: (value: string) => void,
    onBlur: () => void,
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const selection = editor.selection
    useLayoutEffect(() => {
        const input = inputRef.current
        if (!input || selection === null) return
        input.focus()
        if (selection === 'all') input.select()
        else input.setSelectionRange(selection.start, selection.end)
    }, [selection])

    return <input className="table-row" ref={inputRef} value={editor.value}
        onChange={event => onChange(event.currentTarget.value)} onBlur={onBlur} />
}
