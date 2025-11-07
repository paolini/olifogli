import { memo, Dispatch, SetStateAction, useState } from 'react'
import { WithId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { RowInputState, startNewRow, hasUnsavedChanges, handleRowChange } from './RowInputStateActions'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRow'
import TableRow from './TableRow'
import Button from './Button'
import { TableContext } from './Table'

export default function TableInner({
  ctx,
  rowInputState,
  setRowInputState,
  setSort,
  criteria,
  edit,
  refreshLoading
}: {
  ctx: TableContext,
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria,
  edit?: boolean,
  refreshLoading?: boolean
}) {
  // Usa l'ID come ancora per la selezione a intervallo per resistere ai riordinamenti
  const [lastClickedId, setLastClickedId] = useState<string|null>(null)
  const toggleSelectAll = () => {
    if (ctx.selectedIds.size === ctx.viewRows.length) {
      ctx.setSelectedIds(new Set())
    } else {
      ctx.setSelectedIds(new Set(ctx.viewRows.map(row => row._id.toString())))
    }
  }

  const toggleSelectRow = (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    // nativeEvent può essere MouseEvent o InputEvent, ma shiftKey è solo su MouseEvent
    const native = e.nativeEvent
    const shift = 'shiftKey' in native && typeof native.shiftKey === 'boolean' ? native.shiftKey : false
    const checked = e.currentTarget.checked
    ctx.setSelectedIds(prev => {
      const next = new Set(prev)
  if (shift && lastClickedId) {
        const anchorIndex = ctx.viewRows.findIndex(r => r._id.toString() === lastClickedId)
        const currentIndex = ctx.viewRows.findIndex(r => r._id.toString() === rowId)
        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex)
          const end = Math.max(anchorIndex, currentIndex)
          const idsInRange = ctx.viewRows.slice(start, end + 1).map(r => r._id.toString())
          if (checked) idsInRange.forEach(id => next.add(id))
          else idsInRange.forEach(id => next.delete(id))
          return next
        }
        // se l'ancora non è trovata, ricadi al toggle singolo
      }
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
    setLastClickedId(rowId)
  }

  return <table className="my-table">
    <TableHeaders 
      ctx={ctx}
      setSort={setSort}
      criteria={criteria}
      allSelected={ctx.selectedIds.size === ctx.viewRows.length && ctx.viewRows.length > 0}
      toggleSelectAll={toggleSelectAll}
    />
    <TableBody 
      ctx={ctx}
      rowInputState={rowInputState}
      setRowInputState={setRowInputState}
      edit={edit}
      toggleSelectRow={toggleSelectRow}
      refreshLoading={refreshLoading}
    />
  </table>
}

function TableHeaders({ctx, setSort, criteria, allSelected, toggleSelectAll}: {
  ctx: TableContext,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria,
  allSelected: boolean,
  toggleSelectAll: () => void
}) {
  const columns = ctx.schema.fields.filter(f => ctx.showHiddenColumns || !f.hidden);

  const additional_columns = [
    {name: 'createdOn', label: 'istante creazione'},
    {name: 'createdBy', label: 'creato da'},
    {name: 'updatedOn', label: 'istante modifica'},
    {name: 'updatedBy', label: 'aggiornato da'},
  ]

  return <>
      <colgroup>
        <col className="checkbox-cell" />
        { ctx.showAdditionalColumns && 
          additional_columns.map(col => <col key={col.name} className={col.name} />)
        }
        {columns.map(field => <col key={field.name} className={field.css_class} />)}
        <col className="actions-cell" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="checkbox-cell">
            <input 
              type="checkbox" 
              checked={allSelected}
              onChange={toggleSelectAll}
            />
          </th>
          { ctx.showAdditionalColumns && 
            additional_columns.map(col => (
              <th scope="col" key={col.name} className={col.name}>
                {col.label}
                <SortIcon field={col.name} criteria={criteria} setSort={setSort} />
              </th>
            ))
          }
          {columns.map(field => 
            <th scope="col" key={field.name} className={field.css_class} style={{ position: 'relative' }}>
              {field.header}
              <SortIcon field={field} criteria={criteria} setSort={setSort} />
            </th>)}
          <th scope="col" className="actions-cell"></th>
        </tr>
      </thead>
    </>
}

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
    {ctx.viewRows.map((row, index) => {
      const prevRow = index > 0 ? ctx.viewRows[index - 1] : null
      const nextRow = index < ctx.viewRows.length - 1 ? ctx.viewRows[index + 1] : null
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
        prevRow={ctx.viewRows.length > 0 ? ctx.viewRows[ctx.viewRows.length - 1] : null} />
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
  return <TableRow 
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

