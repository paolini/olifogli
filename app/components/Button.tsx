'use client';

import { cn } from '@/app/lib/utils';
import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'disabled';
  children: ReactNode;
};

export default function Button({ children, onClick, variant = 'default', disabled, ...props }: ButtonProps) {
  const baseStyles = 'px-4 py-2 rounded-lg font-medium transition';
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-100',
    disabled: 'bg-gray-300 text-gray-500 cursor-not-allowed',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyles, disabled ? variants.disabled : variants[variant])}
      {...props}
    >
      {children}
    </button>
  );
}
