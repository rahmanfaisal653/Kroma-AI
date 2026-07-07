import React from 'react';

interface InputFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export function InputField({ label, hint, children }: InputFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
        {label}
        {hint && <span className="font-normal text-slate-400 ml-1">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
