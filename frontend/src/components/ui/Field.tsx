import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, helper, error, containerClassName, className, id, ...rest }, ref) => {
    const fieldId = id ?? `field-${label?.toString().replace(/\s+/g, '-').toLowerCase()}`;
    return (
      <div className={cn('flex flex-col gap-1', containerClassName)}>
        <label htmlFor={fieldId} className="text-caption font-semibold text-text">
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            'h-10 rounded-sm border bg-white px-3 text-body text-text placeholder:text-text-muted',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100',
            error ? 'border-error' : 'border-border',
            className
          )}
          {...rest}
        />
        {helper && !error && <span className="text-caption text-text-muted">{helper}</span>}
        {error && <span className="text-caption text-error">{error}</span>}
      </div>
    );
  }
);
Field.displayName = 'Field';
