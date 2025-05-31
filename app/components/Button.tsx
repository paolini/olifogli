'use client';
import classNames from 'classnames'

import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  variant?: 'default' | 'outline' | 'disabled';
  children: ReactNode;
};

export default function Button({ children, className, onClick, variant = 'default', disabled, ...props }: ButtonProps) {
  const baseStyles = 'px-4 py-2 font-medium transition'.split(' ');
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700'.split(' '),
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-100'.split(' '),
    disabled: 'bg-gray-300 text-gray-500 cursor-not-allowed'.split(' '),
  };

  return <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(...baseStyles, ...(disabled ? variants.disabled : variants[variant]), ...className ? className.split(' ') : [])}
      {...props}
    >
      {children}
    </button>
  
}
