import { useState, memo } from 'react'
import { WithId, ObjectId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/graphql/generated'
import { Criteria } from './Ordering'
import SortIcon from './SortIcon'
import TableInputRow from './TableInputRow'
import TableRow from './TableRow'

export default function TableInner({rows, currentRowId, setCurrentRowId, sheet, schema, showStandardAnswers, showAdditionalColumns, setSort, criteria, edit}: {
  rows: Row[],
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria,
  edit?: boolean
}) {
  return <table className="my-table">
    <TableHeaders 
      schema={schema} 
      showAdditionalColumns={showAdditionalColumns} 
      setSort={setSort}
      criteria={criteria}
    />
    <TableBody 
      rows={rows} 
      currentRowId={currentRowId} 
      setCurrentRowId={setCurrentRowId} 
      sheet={sheet} 
      schema={schema} 
      showStandardAnswers={showStandardAnswers} 
      showAdditionalColumns={showAdditionalColumns} 
      edit={edit}
    />
  </table>
}

function TableHeaders({schema, showAdditionalColumns, setSort, criteria}: {
  schema: Schema,
  showAdditionalColumns: boolean,
  setSort: (field: Field|string, direction: number) => void,
  criteria?: Criteria
}) {
  const columns = schema.fields.filter(f => !f.hidden);

  const additional_columns = [
    {name: 'createdOn', label: 'istante creazione'},
    {name: 'createdBy', label: 'creato da'},
    {name: 'updatedOn', label: 'istante modifica'},
    {name: 'updatedBy', label: 'aggiornato da'},
  ]

  return <>
      <colgroup>
        { showAdditionalColumns && 
          additional_columns.map(col => <col key={col.name} className={col.name} />)
        }
        {columns.map(field => <col key={field.name} className={field.css_class} />)}
        <col className="actions-cell" />
      </colgroup>
      <thead>
        <tr>
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

function TableBody({rows,currentRowId,setCurrentRowId,sheet,schema,showStandardAnswers,showAdditionalColumns, edit}: {
  rows: Row[],
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  edit?: boolean
}) {
  const [focusFieldName, setFocusFieldName] = useState<string|null>(null)  

  // Trova la prima colonna editabile vuota
  function findFirstEmptyEditableField(row: Row): string | null {
    const editableFields = schema.fields.filter(f => !f.hidden && f.editable)
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
            focusFieldName={focusFieldName} 
            onMoveToNext={() => moveToNextRow(index)}
            />
        : <MyRow 
            key={row._id.toString()} 
            schema={schema} 
            row={row} 
            showStandardAnswers={showStandardAnswers} 
            showAdditionalColumns={showAdditionalColumns} 
            onCellClick={fieldName => onCellClick(row, fieldName)}
            />)} 
      {edit && (currentRowId 
        ? <tr><td colSpan={schema.fields.length}><button className="bg-alert" onClick={() => setCurrentRowId(null)}>
          aggiungi riga
          </button></td></tr>
        : <TableInputRow sheetId={sheet._id.toString()} schema={schema} showAdditionalColumns={showAdditionalColumns} />)}
  </tbody>

  function onCellClick(row: WithId<Row>, fieldName: string) {
    if (edit) {
      setCurrentRowId(row._id)
      setFocusFieldName(fieldName)
    }
  }

}

const MyRow = memo(MyRowInternal)

function MyRowInternal({schema, row, showStandardAnswers, showAdditionalColumns, onCellClick}: {
  schema: Schema,
  row: WithId<Row>,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  onCellClick: (fieldName: string) => void
}) {
  return <TableRow schema={schema} row={row} onCellClick={onCellClick} showStandardAnswers={showStandardAnswers} showAdditionalColumns={showAdditionalColumns} />
}

