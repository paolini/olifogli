import { useState, memo } from 'react'
import { WithId, ObjectId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRow'
import TableRow from './TableRow'

export default function TableInner({rows, selectedRows, setSelectedRows, currentRowId, setCurrentRowId, sheet, schema, showStandardAnswers, showAdditionalColumns, showHiddenColumns, setSort, criteria, edit}: {
  rows: Row[],
  selectedRows: Set<string>,
  setSelectedRows: (selected: Set<string>) => void,
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
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
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(rows.map(row => row._id.toString())))
    }
  }

  const toggleSelectRow = (rowId: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId)
    } else {
      newSelected.add(rowId)
    }
    setSelectedRows(newSelected)
  }

  return <table className="my-table">
    <TableHeaders 
      schema={schema} 
      showAdditionalColumns={showAdditionalColumns} 
      showHiddenColumns={showHiddenColumns}
      setSort={setSort}
      criteria={criteria}
      allSelected={selectedRows.size === rows.length && rows.length > 0}
      toggleSelectAll={toggleSelectAll}
    />
    <TableBody 
      rows={rows} 
      currentRowId={currentRowId} 
      setCurrentRowId={setCurrentRowId} 
      sheet={sheet} 
      schema={schema} 
      showStandardAnswers={showStandardAnswers} 
      showAdditionalColumns={showAdditionalColumns} 
      showHiddenColumns={showHiddenColumns}
      edit={edit}
      selectedRows={selectedRows}
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

function TableBody({rows,currentRowId,setCurrentRowId,sheet,schema,showStandardAnswers,showAdditionalColumns, showHiddenColumns, edit, selectedRows, toggleSelectRow}: {
  rows: Row[],
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  edit?: boolean,
  selectedRows: Set<string>,
  toggleSelectRow: (rowId: string) => void
}) {
  const [focusFieldName, setFocusFieldName] = useState<string|null>(null)  

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
      setCurrentRowId(nextRow._id)
      const firstEmptyField = findFirstEmptyEditableField(nextRow)
      setFocusFieldName(firstEmptyField)
    } else {
      // Se siamo all'ultima riga, chiudi la modalità di modifica
      setCurrentRowId(null)
      setFocusFieldName(null)
    }
  }

  return <tbody>
      {rows.map((row, index) => (edit && row._id === currentRowId) 
        ? <TableInputRow 
            key={row._id.toString()}
            sheetId={sheet._id.toString()} 
            schema={schema} 
            row={row} 
            done={() => setCurrentRowId(null)} 
            showAdditionalColumns={showAdditionalColumns} 
            showHiddenColumns={showHiddenColumns}
            focusFieldName={focusFieldName} 
            onMoveToNext={() => moveToNextRow(index)}
            isSelected={selectedRows.has(row._id.toString())}
            onToggleSelect={() => toggleSelectRow(row._id.toString())}
            />
        : <MyRow 
            key={row._id.toString()} 
            schema={schema} 
            row={row} 
            showStandardAnswers={showStandardAnswers} 
            showAdditionalColumns={showAdditionalColumns} 
            showHiddenColumns={showHiddenColumns}
            onCellClick={fieldName => onCellClick(row, fieldName)}
            isSelected={selectedRows.has(row._id.toString())}
            onToggleSelect={() => toggleSelectRow(row._id.toString())}
            />)} 
      {edit && (currentRowId 
        ? <tr><td colSpan={schema.fields.length + 1}><button className="bg-alert" onClick={() => setCurrentRowId(null)}>
          aggiungi riga
          </button></td></tr>
        : <TableInputRow sheetId={sheet._id.toString()} schema={schema} showAdditionalColumns={showAdditionalColumns} showHiddenColumns={showHiddenColumns} />
      )}
  </tbody>

  function onCellClick(row: WithId<Row>, fieldName: string) {
    if (edit) {
      setCurrentRowId(row._id)
      setFocusFieldName(fieldName)
    }
  }
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

