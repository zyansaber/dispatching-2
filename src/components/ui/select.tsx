import * as React from 'react';

import { cn } from '@/lib/utils';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectContextValue = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  setValue: (value: string) => void;
  registerOption: (option: Option) => void;
  unregisterOption: (value: string) => void;
  options: Option[];
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(component: string): SelectContextValue {
  const context = React.useContext(SelectContext);

  if (!context) {
    throw new Error(`${component} must be used within a Select`);
  }

  return context;
}

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  children: React.ReactNode;
};

const Select = ({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  name,
  placeholder,
  disabled,
  children,
}: SelectProps) => {
  const [options, setOptions] = React.useState<Option[]>([]);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) {
        setUncontrolledValue(next);
      }

      onValueChange?.(next);
    },
    [isControlled, onValueChange]
  );

  const registerOption = React.useCallback((option: Option) => {
    setOptions((prev) => {
      if (prev.some((item) => item.value === option.value)) {
        return prev.map((item) => (item.value === option.value ? option : item));
      }

      return [...prev, option];
    });
  }, []);

  const unregisterOption = React.useCallback((optionValue: string) => {
    setOptions((prev) => prev.filter((option) => option.value !== optionValue));
  }, []);

  const contextValue = React.useMemo(
    () => ({
      value,
      placeholder,
      disabled,
      name,
      setValue,
      registerOption,
      unregisterOption,
      options,
    }),
    [value, placeholder, disabled, name, setValue, registerOption, unregisterOption, options]
  );

  return <SelectContext.Provider value={contextValue}>{children}</SelectContext.Provider>;
};

const SelectGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-1', className)} {...props} />
);

const SelectLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => <span ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
);
SelectLabel.displayName = 'SelectLabel';

const SelectValue = ({ className }: { className?: string }) => {
  const { value, placeholder, options } = useSelectContext('SelectValue');
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return <span className={cn('text-left text-sm', className)}>{selectedLabel ?? placeholder ?? ''}</span>;
};

const SelectTrigger = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    const { value, placeholder, disabled, name, setValue, options } = useSelectContext('SelectTrigger');

    return (
      <div className="relative flex w-full items-center">
        <select
          ref={ref}
          name={name}
          disabled={disabled}
          value={value}
          className={cn(
            'flex h-10 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          onChange={(event) => setValue(event.target.value)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 text-muted-foreground">▾</span>
        <span className="sr-only">{children}</span>
      </div>
    );
  }
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectScrollUpButton = () => null;

const SelectScrollDownButton = () => null;

const SelectContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('hidden', className)} aria-hidden="true" {...props} />
);
SelectContent.displayName = 'SelectContent';

const SelectItem = ({ value, children, disabled }: { value: string; children: React.ReactNode; disabled?: boolean }) => {
  const { registerOption, unregisterOption } = useSelectContext('SelectItem');

  React.useEffect(() => {
    const label = typeof children === 'string' ? children : React.isValidElement(children) ? String(children.props.children ?? '') : String(children);

    registerOption({ value, label, disabled });

    return () => unregisterOption(value);
  }, [value, children, disabled, registerOption, unregisterOption]);

  return null;
};
SelectItem.displayName = 'SelectItem';

const SelectSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('my-1 h-px bg-muted', className)} {...props} />
);
SelectSeparator.displayName = 'SelectSeparator';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
