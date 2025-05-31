'use client'
import classNames from 'classnames'

import { ButtonHTMLAttributes, ReactNode, useState } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  children: ReactNode;
};

export default function Button({ children, className, onClick, disabled, ...props }: ButtonProps) {
  const [busy, setBusy] = useState(false)
  const baseStyles = 'px-1 py-1 font-medium transition'.split(' ')
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700'.split(' '),
    disabled: 'bg-gray-300 text-gray-500 cursor-not-allowed'.split(' '),
  }

  return <button
      onClick={onClickSync}
      disabled={disabled || busy}
      className={classNames(...baseStyles, ...(disabled || busy ? variants.disabled : variants.default), ...className ? className.split(' ') : [])}
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
