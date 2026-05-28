"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MatriculaInputProps {
  value: string;
  onChange: (value: string) => void;
  matriculas: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MatriculaInput({
  value,
  onChange,
  matriculas,
  placeholder = "1234 ABC",
  disabled,
  className,
}: MatriculaInputProps) {
  const listId = useId();

  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(className)}
        autoComplete="off"
      />
      <datalist id={listId}>
        {matriculas.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}
