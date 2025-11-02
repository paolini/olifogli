import { memo, Dispatch, SetStateAction, useState } from 'react'
import { WithId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { RowInputState, startEditRow, startNewRow, stopEditRow, updateNewData, hasUnsavedChanges, handleRowChange } from './RowInputStateActions'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRow'
import TableRow from './TableRow'
import Button from './Button'

export default function TableInner({
  rows,
  selectedIds,
  setSelectedIds,
  rowInputState,
  setRowInputState,
  sheet,
  schema,
  showStandardAnswers,
  showAdditionalColumns,
  showHiddenColumns,
  setSort,
  criteria,
  edit,
  onRefresh,
  refreshLoading
}: {
  rows: Row[],
  selectedIds: Set<string>,
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>,
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria,
  edit?: boolean,
  onRefresh?: () => Promise<void>,
  refreshLoading?: boolean
}) {
  // Usa l'ID come ancora per la selezione a intervallo per resistere ai riordinamenti
  const [lastClickedId, setLastClickedId] = useState<string|null>(null)
  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(row => row._id.toString())))
    }
  }

  const toggleSelectRow = (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    // nativeEvent può essere MouseEvent o InputEvent, ma shiftKey è solo su MouseEvent
    const native = e.nativeEvent
    const shift = 'shiftKey' in native && typeof native.shiftKey === 'boolean' ? native.shiftKey : false
    const checked = e.currentTarget.checked
    setSelectedIds(prev => {
      const next = new Set(prev)
  if (shift && lastClickedId) {
        const anchorIndex = rows.findIndex(r => r._id.toString() === lastClickedId)
        const currentIndex = rows.findIndex(r => r._id.toString() === rowId)
        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex)
          const end = Math.max(anchorIndex, currentIndex)
          const idsInRange = rows.slice(start, end + 1).map(r => r._id.toString())
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
      schema={schema} 
      showAdditionalColumns={showAdditionalColumns} 
      showHiddenColumns={showHiddenColumns}
      setSort={setSort}
      criteria={criteria}
      allSelected={selectedIds.size === rows.length && rows.length > 0}
      toggleSelectAll={toggleSelectAll}
    />
    <TableBody 
      rows={rows} 
      rowInputState={rowInputState}
      setRowInputState={setRowInputState}
      sheet={sheet} 
      schema={schema} 
      showStandardAnswers={showStandardAnswers} 
      showAdditionalColumns={showAdditionalColumns} 
      showHiddenColumns={showHiddenColumns}
      edit={edit}
      selectedIds={selectedIds}
  toggleSelectRow={toggleSelectRow}
      onRefresh={onRefresh}
      refreshLoading={refreshLoading}
    />
  </table>
}

function TableHeaders({schema, showAdditionalColumns, showHiddenColumns, setSort, criteria, allSelected, toggleSelectAll}: {
  schema: Schema,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria,
  allSelected: boolean,
  toggleSelectAll: () => void
}) {
  const columns = schema.fields.filter(f => showHiddenColumns || !f.hidden);

  const additional_columns = [
    {name: 'createdOn', label: 'istante creazione'},
    {name: 'createdBy', label: 'creato da'},
    {name: 'updatedOn', label: 'istante modifica'},
    {name: 'updatedBy', label: 'aggiornato da'},
  ]

  return <>
      <colgroup>
        <col className="checkbox-cell" />
        { showAdditionalColumns && 
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
          { showAdditionalColumns && 
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
  rows,
  rowInputState,
  setRowInputState,
  sheet,
  schema,
  showStandardAnswers,
  showAdditionalColumns,
  showHiddenColumns,
  edit,
  selectedIds,
  toggleSelectRow,
  onRefresh,
  refreshLoading
}: {
  rows: Row[],
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  edit?: boolean,
  selectedIds: Set<string>,
  toggleSelectRow: (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => void,
  onRefresh?: () => Promise<void>,
  refreshLoading?: boolean
}) {
  // Trova la prima colonna editabile vuota
  function findFirstEmptyEditableField(row: Row): string | null {
    const editableFields = schema.fields.filter(f => (showHiddenColumns || !f.hidden) && f.editable)
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
    {rows.map((row, index) => {
      const prevRow = index > 0 ? rows[index - 1] : null
      const nextRow = index < rows.length - 1 ? rows[index + 1] : null
      const nextFieldName = nextRow ? findFirstEmptyEditableField(nextRow) : null
      
      return (edit && rowInputState.rowIsBeingEdited && row._id === rowInputState.rowId)
        ? <TableInputRow
            key={row._id.toString()}
            sheetId={sheet._id.toString()}
            schema={schema}
            row={row}
            rowInputState={rowInputState}
            setRowInputState={setRowInputState}
            showAdditionalColumns={showAdditionalColumns}
            showHiddenColumns={showHiddenColumns}
            prevRow={prevRow}
            nextRow={nextRow}
            nextFieldName={nextFieldName}
            isSelected={selectedIds.has(row._id.toString())}
            onToggleSelect={(e) => toggleSelectRow(row._id.toString(), e)}
          />
        : <MyRow
            key={row._id.toString()}
            schema={schema}
            row={row}
            showStandardAnswers={showStandardAnswers}
            showAdditionalColumns={showAdditionalColumns}
            showHiddenColumns={showHiddenColumns}
            onCellClick={fieldName => {
              if (edit) {
                handleRowChange(rowInputState, setRowInputState, row, fieldName)
              }
            }}
            isSelected={selectedIds.has(row._id.toString())}
            onToggleSelect={(e) => toggleSelectRow(row._id.toString(), e)}
          />
    })}
    {edit && rowInputState.rowIsBeingEdited && rowInputState.rowId === null && (
      <TableInputRow 
        key="new-row"
        sheetId={sheet._id.toString()} 
        schema={schema}
        rowInputState={rowInputState}
        setRowInputState={setRowInputState}
        showAdditionalColumns={showAdditionalColumns} 
        showHiddenColumns={showHiddenColumns}
        prevRow={rows.length > 0 ? rows[rows.length - 1] : null} />
    )}
    {edit && !(rowInputState.rowIsBeingEdited && rowInputState.rowId === null) && (
      <tr key="add-row">
        <td colSpan={schema.fields.length + 2}>
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
          {onRefresh && (
            <Button 
              className="ml-2"
              onClick={onRefresh}
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

