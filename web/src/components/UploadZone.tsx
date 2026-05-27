import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

export function UploadZone({ label, accept = ".pdf,.csv", file, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    onChange(selected);
    e.target.value = "";
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer select-none",
          dragging && "border-brand-400 bg-brand-50",
          !dragging && !file && "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100",
          file && "border-green-400 bg-green-50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {file ? (
          <>
            <FileText className="h-7 w-7 text-green-500" />
            <span className="text-sm font-medium text-green-700 max-w-[200px] truncate">{file.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="absolute top-2 right-2 rounded-full p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <UploadCloud className="h-7 w-7 text-gray-400" />
            <span className="text-sm text-gray-500">
              Arraste aqui ou <span className="text-brand-600 underline">clique para selecionar</span>
            </span>
            <span className="text-xs text-gray-400">PDF ou CSV</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
