import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react' 

import { Criteria } from './Ordering'
import { Field } from '../lib/schema/fields'

export default function SortIcon({ field, criteria, setSort }: 
    { 
      field: Field|string, // Field object or field name 
      criteria?: Criteria, 
      setSort: (field: Field|string, direction: number) => void }
  ) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null)

  const sortCriteria = criteria ? criteria.criteriOrdina.find(c => c.campo === field) : 0
  const icon = sortCriteria 
    ? (sortCriteria.direzione > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />)
    : <ChevronsUpDown size={16} />
  
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPosition({ top: rect.bottom, left: rect.left })
    } else {
      setMenuPosition(null)
    }
  }, [isOpen])

  const menu = isOpen && menuPosition ? (
    <div style={{
      position: 'fixed',
      top: menuPosition.top,
      left: menuPosition.left,
      backgroundColor: 'white',
      border: '1px solid #ccc',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      zIndex: 1001,
      minWidth: '100px'
    }}>
      <button 
        onClick={() => { setSort(field, 1); setIsOpen(false); }}
        style={{ display: 'block', width: '100%', padding: '8px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
      >
        Ascendente
      </button>
      <button 
        onClick={() => { setSort(field, -1); setIsOpen(false); }}
        style={{ display: 'block', width: '100%', padding: '8px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
      >
        Discendente
      </button>
    </div>
  ) : null

  return (
    <>
      <button 
        ref={buttonRef}
        className={`sort-icon-button text-gray-500 hover:text-gray-700 ${sortCriteria ? 'sort-visible' : 'sort-hidden'}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="Ordina"
      >
        {icon}
      </button>
      {createPortal(menu, document.body)}
    </>
  )
}

