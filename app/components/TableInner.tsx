import { memo, Dispatch, SetStateAction } from 'react'
import { WithId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { RowInputState, startEditRow, startNewRow, stopEditRow, updateNewData, hasUnsavedChanges, handleRowChange } from './RowInputStateActions'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRow'
import TableRow from './TableRow'

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
  edit
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
  edit?: boolean
}) {
  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(row => row._id.toString())))
    }
  }

  const toggleSelectRow = (rowId: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId)
    } else {
      newSelected.add(rowId)
    }
    setSelectedIds(newSelected)
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
  toggleSelectRow
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
  toggleSelectRow: (rowId: string) => void
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

  // Gestisce il passaggio alla riga successiva
  function moveToNextRow(currentIndex: number) {
    if (currentIndex < rows.length - 1) {
      const nextRow = rows[currentIndex + 1]
      const firstEmptyField = findFirstEmptyEditableField(nextRow)
      handleRowChange(rowInputState, setRowInputState, nextRow, firstEmptyField)
    } else {
      handleRowChange(rowInputState, setRowInputState, null)
    }
  }

  return <tbody>
    {rows.map((row, index) => (edit && rowInputState.rowIsBeingEdited && row._id === rowInputState.rowId)
      ? <TableInputRow
          key={row._id.toString()}
          sheetId={sheet._id.toString()}
          schema={schema}
          row={row}
          rowInputState={rowInputState}
          setRowInputState={setRowInputState}
          showAdditionalColumns={showAdditionalColumns}
          showHiddenColumns={showHiddenColumns}
          onMoveToNext={() => moveToNextRow(index)}
          isSelected={selectedIds.has(row._id.toString())}
          onToggleSelect={() => toggleSelectRow(row._id.toString())}
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
          onToggleSelect={() => toggleSelectRow(row._id.toString())}
        />)}
    {edit && rowInputState.rowIsBeingEdited && rowInputState.rowId === null && (
      <TableInputRow 
        key="new-row"
        sheetId={sheet._id.toString()} 
        schema={schema}
        rowInputState={rowInputState}
        setRowInputState={setRowInputState}
        showAdditionalColumns={showAdditionalColumns} 
        showHiddenColumns={showHiddenColumns} />
    )}
    {edit && !(rowInputState.rowIsBeingEdited && rowInputState.rowId === null) && (
      <tr key="add-row">
        <td colSpan={schema.fields.length + 2}>
          <button className="bg-alert" onClick={() => {
            if (hasUnsavedChanges(rowInputState)) {
              const confirmed = confirm(
                'Ci sono modifiche non salvate. Vuoi abbandonare le modifiche e creare una nuova riga?'
              )
              if (!confirmed) return
            }
            startNewRow(setRowInputState)
          }}>
            aggiungi riga
          </button>
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
  onToggleSelect: () => void
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

