'use client'
import classNames from 'classnames'

import { ButtonHTMLAttributes, ReactNode, useState } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string
  children: ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void | Promise<void>
  disabled?: boolean
  variant?: 'default' | 'danger' | 'alert'
}

export default function Button({ 
  className,
  children, 
  onClick, 
  disabled,
  variant, 
  ...props }: ButtonProps) {
  const [busy, setBusy] = useState(false)
  const baseStyles = 'px-1 py-1 font-medium transition'.split(' ')
  const class_enabled = {
    default: 'bg-blue-600 text-white hover:bg-blue-700'.split(' '),
    danger: 'bg-red-600 text-white hover:bg-red-700'.split(' '),
    alert: 'bg-yellow-600 text-white hover:bg-yellow-700'.split(' '),
  }
  const class_disabled = {
    default: 'bg-gray-300 text-gray-500 cursor-not-allowed'.split(' '),
    danger: 'bg-red-300 text-red-500 cursor-not-allowed'.split(' '),
    alert: 'bg-yellow-300 text-yellow-500 cursor-not-allowed'.split(' '),
  }
  disabled = disabled || busy
  variant = variant || 'default'

  return <button
      className={classNames(...baseStyles, ...(disabled ? class_disabled[variant] : class_enabled[variant]), ...className ? className.split(' ') : [])}
      onClick={onClickSync}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>

  async function onClickSync(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    if (!onClick) return
    if (isAsync(onClick)) {
      setBusy(true)
      await onClick(e)
      setBusy(false)
    } else {
      onClick(e)
    }
  }
}

function isAsync(fn: unknown) {
  return fn instanceof Object && fn.constructor.name === 'AsyncFunction'
}
