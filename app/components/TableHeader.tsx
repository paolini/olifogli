import { Dispatch, SetStateAction } from "react";
import Schema from "../lib/schema/Schema";
import SortIcon from "./SortIcon";
import { Column, SortCriterium } from "./Table";
import { Field } from "../lib/schema/fields";

export default function TableHeader({schema, columns, allSelected, selectAll, selectNone, sortCriterium, doSortRows}: {
    schema: Schema, 
    columns: Column[],
    allSelected: boolean, 
    selectAll: () => void,
    selectNone: () => void,
    sortCriterium: SortCriterium,
    setSortCriterium: Dispatch<SetStateAction<SortCriterium>>,
    doSortRows: (field: Field|string, direction: number) => void
}) {
  return <>
      <colgroup>
        <col className="checkbox-cell" />
            { columns.map(col => <col key={col.name} className={col instanceof Field ? col.css_class : col.name } />) }
        <col className="actions-cell" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="checkbox-cell">
            <input 
              type="checkbox" 
              checked={allSelected}
              onChange={allSelected ? selectNone : selectAll}
            />
          </th>
          { columns.map(col => col instanceof Field 
          // campi di row.data
          ? <th scope="col" key={col.name} className={col.css_class} style={{ position: 'relative' }}>
              {col.header}
              <SortIcon direction={sortCriterium.field === col ? sortCriterium.direction : 0} doSort={(direction) => doSortRows(col, direction)} />
            </th>
          // attributi di row
          : <th scope="col" key={col.name} className={col.name}>
                {col.label}
                <SortIcon direction={sortCriterium.field === col.name ? sortCriterium.direction : 0} doSort={(direction) => doSortRows(col.name, direction)} />
              </th>
          )}
          <th scope="col" className="actions-cell"></th>
        </tr>
      </thead>
    </>
}