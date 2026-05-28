import { useRef, useState } from "react";
import { UploadCloud, FileText, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  accept?: string;
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

/** Zona de upload que aceita VÁRIOS arquivos (ex: 1+ faturas de cartão). */
export function MultiUploadZone({ label, accept = ".pdf,.csv", files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list || disabled) return;
    const novos = Array.from(list);
    // evita duplicar pelo nome+tamanho
    const chave = (f: File) => `${f.name}:${f.size}`;
    const existentes = new Set(files.map(chave));
    onChange([...files, ...novos.filter((f) => !existentes.has(chave(f)))]);
  }

  function removeAt(i: number) {
    onChange(files.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>

      {/* Lista de arquivos já selecionados */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-green-600" />
              <span className="flex-1 truncate text-sm text-green-800">{f.name}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Área para adicionar (mais) arquivos */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors cursor-pointer select-none",
          dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {files.length === 0 ? (
          <>
            <UploadCloud className="h-7 w-7 text-gray-400" />
            <span className="text-sm text-gray-500">
              Arraste aqui ou <span className="text-brand-600 underline">clique para selecionar</span>
            </span>
            <span className="text-xs text-gray-400">PDF ou CSV — pode enviar mais de uma</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-brand-600">
            <Plus className="h-4 w-4" /> Adicionar outra fatura
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        disabled={disabled}
      />
    </div>
  );
}
