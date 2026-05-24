import { Dispatch, KeyboardEvent, SetStateAction } from "react"
import TableRow, { RowSelectionState } from "./TableRow"
import { Column, Line, TableState } from "./Table"
import { ApolloError } from "@apollo/client"
import Button from "./Button"
import { pluralize } from "../lib/util"
import { Sheet } from "../graphql/generated"
import Schema from "../lib/schema/Schema"

export default function TableBody({sheet, schema, edit, columns, tableState, setTableState, showStandardAnswers, loading, error, dismissErrors, onCellClick, addNewRow, setLineData, directInput, setDirectInput, cellKeyDownHandler, adminEditMode} : {
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
    setLineData: (line: Line, field: string, value: string | undefined) => void,
    directInput: boolean,
    setDirectInput: Dispatch<SetStateAction<boolean>>,
    cellKeyDownHandler: (e: KeyboardEvent<HTMLInputElement>) => void,
    adminEditMode: boolean,
}) {
    const focusLine = tableState.lines.find(l => l.key === tableState.focusLineKey)
    const validationContext = schema.validationContext(sheet.commonData, sheet.workbook.commonData)

    return <tbody>
        {tableState.lines.map(line => {
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
                  line={line}
                  setLineData={(field:string, value:string | undefined) => setLineData(line,field,value)}
                  columns={columns}
                  focusColumnName={focusColumnName}
                  inputFocus={!!(focusColumnName && tableState.inputFocus)}
                  directInput={directInput}
                  setDirectInput={setDirectInput}
                  selectionState={compute_selection_state_for_row(line.key)}
                  showStandardAnswers={showStandardAnswers}
                  onCellClick={(column: Column) => onCellClick(column,line)}
                  cellKeyDownHandler={cellKeyDownHandler}
                  adminEditMode={adminEditMode}
                  validationContext={rowValidationContext}
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

