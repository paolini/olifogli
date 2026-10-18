import { Dispatch, SetStateAction } from "react"
import type { CellEditorState } from './useCellEditor'
import TableRow, { RowSelectionState } from "./TableRow"
import { Column, Line, OtherCursors, TableState } from "./Table"
import { ApolloError } from "@apollo/client"
import Button from "./Button"
import { pluralize } from "../lib/util"
import { Sheet } from "../graphql/generated"
import Schema from "../lib/schema/Schema"

export default function TableBody({sheet, schema, edit, columns, tableState, setTableState, showStandardAnswers, loading, error, dismissErrors, onCellClick, addNewRow, editor, onEditorChange, onEditorBlur, otherCursors} : {
    sheet: Sheet,
    schema: Schema,
    edit: boolean,
    columns: Column[],
    tableState: TableState,
    setTableState: Dispatch<SetStateAction<TableState>>,
    showStandardAnswers: boolean,
    loading: boolean,
    error: ApolloError | undefined,
    dismissErrors: () => void,
    onCellClick: (column: Column, line: Line) => void,
    addNewRow: () => void,
    editor: CellEditorState,
    onEditorChange: (value: string) => void,
    onEditorBlur: (lineKey: string, fieldName: string) => void,
    otherCursors: OtherCursors,
}) {
    const focusLine = tableState.lines.find(l => l.key === tableState.focusLineKey)
    const validationContext = schema.displayValidationContext(sheet.workbook.commonData ?? {})

    return <tbody>
        {tableState.lines.map(line => {
            const draft = editor.mode === 'editing' && editor.lineKey === line.key ? editor : undefined
            const scorePending = Object.keys(line.data).some(name => schema.affectsScore(name)) ||
                (draft && schema.affectsScore(draft.field.name) &&
                    draft.field.clean(draft.value) !== draft.field.display(line.data[draft.field.name] ?? line.row?.data[draft.field.name] ?? '', '', false).value)
            const rowValidationContext = {
                absent: validationContext.absent(line.data),
                context: validationContext,
            }
            const focusColumnName=tableState.focusLineKey === line.key ? tableState.focusFieldName : ''
            if (tableState.focusLineKey === line.key && error) {
              return  <tr key={`error-${line.key}`} className="error" onClick={() => dismissErrors()}><td colSpan={columns.length + 1}>{error.message}</td><td></td></tr>
            }
            return <TableRow
                  key={line.key}
                  line={scorePending ? { ...line, data: { ...line.data, score: '' } } : line}
                  columns={columns}
                  focusColumnName={focusColumnName}
                  editor={editor}
                  onEditorChange={onEditorChange}
                  onEditorBlur={onEditorBlur}
                  selectionState={compute_selection_state_for_row(line.key)}
                  showStandardAnswers={showStandardAnswers}
                  onCellClick={(column: Column) => onCellClick(column,line)}
                  validationContext={rowValidationContext}
                  cursorUsers={Object.entries(otherCursors)
                    .filter(([, c]) => c.lineKey === line.key)
                    .map(([, c]) => ({ email: c.email, fieldName: c.fieldName }))
                  }
            />}
        )}
        <tr className="hide-print"><td></td><td colSpan={columns.length}>
        { edit && (!tableState.focusLineKey || focusLine?.row) && 
          <Button className="px-8" onClick={e => addNewRow()} disabled={loading}>
            aggiungi nuova riga
          </Button>}
        <span className="mx-8">{pluralize(tableState.lines.length,"riga","righe")}, {pluralize(tableState.lines.filter(line => !line?.row?.error).length,"valida","valide")}</span>
        </td></tr>
    </tbody>

    function compute_selection_state_for_row(key: string): RowSelectionState {
        function allIds(key: string, shift: boolean): string[] {
            if (!tableState.lastClickedLineKey || !shift) return [key]
            const currentIndex = tableState.lines.findIndex(line => line.key === key)
            if (currentIndex === -1) return [key] // non dovrebbe accadere!
            let anchorIndex = tableState.lines.findIndex(line => line.key === tableState.lastClickedLineKey)
            if (anchorIndex === -1) anchorIndex = currentIndex
            const [start, end] = [Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex)]
            return tableState.lines.slice(start, end + 1).map(line => line.key)
        }
        function doSelect(shift: boolean) {
            const keys_set = new Set(allIds(key, shift))
            setTableState(prev => ({
                ...prev,
                selectedLineKeys: prev.selectedLineKeys.union(keys_set),
                lastClickedLineKey: key
            }))
        }
        function doDeselect(shift: boolean) {
            const keys_set = new Set(allIds(key, shift))
            setTableState(prev => ({
                ...prev,
                selectedLineKeys: prev.selectedLineKeys.difference(keys_set),
                lastClickedLineKey: key
            }))
        }
        return {
            isSelected: tableState.selectedLineKeys.has(key),
            doSelect, doDeselect
        }
    }
  }

