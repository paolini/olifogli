import { memo, Dispatch, SetStateAction, useState } from 'react'
import { WithId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { RowInputState, startNewRow, hasUnsavedChanges, handleRowChange } from './RowInputStateActions'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRowOld'
import TableRowOld from './TableRowOld'
import Button from './Button'
import { TableContext } from './Table'



function TableBody({
  ctx,
  rowInputState,
  setRowInputState,
  edit,
  toggleSelectRow,
  refreshLoading
}: {
  ctx: TableContext,
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  edit?: boolean,
  toggleSelectRow: (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => void,
  refreshLoading?: boolean
}) {
  // Trova la prima colonna editabile vuota
  function findFirstEmptyEditableField(row: Row): string | null {
    const editableFields = ctx.schema.fields.filter(f => (ctx.showHiddenColumns || !f.hidden) && f.editable)
    for (const field of editableFields) {
      const value = row.data[field.name]
      if (!value || value === '') {
        return field.name
      }
    }
    // Se tutti i campi sono pieni, ritorna il primo campo editabile
    return editableFields.length > 0 ? editableFields[0].name : null
  }

  return <tbody>
    {ctx.rows.map((row, index) => {
      const prevRow = index > 0 ? ctx.rows[index - 1] : null
      const nextRow = index < ctx.rows.length - 1 ? ctx.rows[index + 1] : null
      const nextFieldName = nextRow ? findFirstEmptyEditableField(nextRow) : null
      
      return (edit && rowInputState.rowIsBeingEdited && row._id === rowInputState.rowId)
        ? <TableInputRow
            key={row._id.toString()}
            sheetId={ctx.sheet._id.toString()}
            schema={ctx.schema}
            row={row}
            rowInputState={rowInputState}
            setRowInputState={setRowInputState}
            showAdditionalColumns={ctx.showAdditionalColumns}
            showHiddenColumns={ctx.showHiddenColumns}
            prevRow={prevRow}
            nextRow={nextRow}
            nextFieldName={nextFieldName}
            isSelected={ctx.selectedIds.has(row._id.toString())}
            onToggleSelect={(e) => toggleSelectRow(row._id.toString(), e)}
          />
        : <MyRow
            key={row._id.toString()}
            schema={ctx.schema}
            row={row}
            showStandardAnswers={ctx.showStandardAnswers}
            showAdditionalColumns={ctx.showAdditionalColumns}
            showHiddenColumns={ctx.showHiddenColumns}
            onCellClick={fieldName => {
              if (edit) {
                handleRowChange(rowInputState, setRowInputState, row, fieldName)
              }
            }}
            isSelected={ctx.selectedIds.has(row._id.toString())}
            onToggleSelect={(e) => toggleSelectRow(row._id.toString(), e)}
          />
    })}
    {edit && rowInputState.rowIsBeingEdited && rowInputState.rowId === null && (
      <TableInputRow 
        key="new-row"
        sheetId={ctx.sheet._id.toString()} 
        schema={ctx.schema}
        rowInputState={rowInputState}
        setRowInputState={setRowInputState}
        showAdditionalColumns={ctx.showAdditionalColumns} 
        showHiddenColumns={ctx.showHiddenColumns}
        prevRow={ctx.rows.length > 0 ? ctx.rows[ctx.rows.length - 1] : null} />
    )}
    {edit && !(rowInputState.rowIsBeingEdited && rowInputState.rowId === null) && (
      <tr key="add-row">
        <td colSpan={ctx.schema.fields.length + 2}>
          <Button onClick={() => {
            if (hasUnsavedChanges(rowInputState)) {
              const confirmed = confirm(
                'Ci sono modifiche non salvate. Vuoi abbandonare le modifiche e creare una nuova riga?'
              )
              if (!confirmed) return
            }
            startNewRow(setRowInputState)
          }}>
            aggiungi riga
          </Button>
          {ctx.onRefresh && (
            <Button 
              className="ml-2"
              onClick={ctx.onRefresh}
              disabled={refreshLoading}
              variant="alert"
            >
              {refreshLoading ? 'aggiornamento...' : 'aggiorna'}
            </Button>
          )}
        </td>
      </tr>
    )}
  </tbody>
}

const MyRow = memo(MyRowInternal)

function MyRowInternal({schema, row, showStandardAnswers, showAdditionalColumns, showHiddenColumns, onCellClick, isSelected, onToggleSelect}: {
  schema: Schema,
  row: WithId<Row>,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  onCellClick: (fieldName: string) => void,
  isSelected: boolean,
  onToggleSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return <TableRowOld 
    schema={schema} 
    row={row} 
    onCellClick={onCellClick} 
    showStandardAnswers={showStandardAnswers} 
    showAdditionalColumns={showAdditionalColumns} 
    showHiddenColumns={showHiddenColumns}
    isSelected={isSelected}
    onToggleSelect={onToggleSelect}
  />
}

