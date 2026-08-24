import React, { useCallback, useId, useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatBytes, plural } from '../../lib/format';
import { Button } from './button';

/**
 * A file picker that also accepts a drop.
 *
 * The native <input type="file"> is kept — it is what actually holds the selection and
 * what a keyboard or screen-reader user operates — but it is visually replaced, because
 * the browser default gives no room to list what was chosen. Files are held by the
 * caller, not here, so removing one can update the caller's state rather than fighting
 * the input's read-only FileList.
 */
export function Dropzone({
  files,
  onFilesChange,
  accept = '.txt',
  multiple = true,
  disabled,
  label,
  hint,
  className,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const accepted = useCallback(
    (list: FileList | null): File[] => {
      const all = list ? Array.from(list) : [];
      if (!accept) return all;
      // Extension match only: a .txt dragged out of some editors arrives with an empty
      // MIME type, and rejecting those would be baffling.
      const extensions = accept.split(',').map((s) => s.trim().toLowerCase());
      return all.filter((file) => extensions.some((ext) => file.name.toLowerCase().endsWith(ext)));
    },
    [accept]
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const next = accepted(event.dataTransfer.files);
    if (next.length) onFilesChange(multiple ? [...files, ...next] : next.slice(0, 1));
  };

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
    // The input keeps its own FileList; clearing it means re-picking the same file
    // still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-border bg-surface-2/40 opacity-60'
            : 'cursor-pointer border-border bg-surface-2/40 hover:border-brand/50 hover:bg-brand-soft/40',
          dragging && 'border-brand bg-brand-soft'
        )}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const next = accepted(e.target.files);
            onFilesChange(multiple ? [...files, ...next] : next.slice(0, 1));
          }}
        />
        <UploadCloud
          className={cn('mx-auto h-6 w-6', dragging ? 'text-brand' : 'text-subtle')}
          aria-hidden="true"
        />
        {/* Kept as a real <label> so the visually-hidden input has an accessible name,
            but its click must not bubble: the surrounding div opens the picker too, and
            the dialog would appear twice. */}
        <label
          htmlFor={inputId}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 block cursor-pointer text-sm font-medium text-fg"
        >
          {label}
        </label>
        <p className="mt-1 text-xs text-muted">
          {hint || (
            <>
              Drag {multiple ? 'files' : 'a file'} here, or click to browse ({accept})
            </>
          )}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between text-xs text-muted">
            <span>
              {files.length} {plural(files.length, 'file')} selected
            </span>
            <Button variant="link" size="sm" onClick={() => onFilesChange([])} disabled={disabled}>
              Clear all
            </Button>
          </li>
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-subtle">
                {formatBytes(file.size)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeAt(index)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
