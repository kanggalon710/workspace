import { T } from "./shared";

export function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl shadow-2xl p-6 w-[85%] max-w-sm mx-auto" style={{ background: T.bg }}>
        <p className="text-sm font-medium text-center mb-5" style={{ color: T.deep }}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium"
            style={{ background: T.surfaceHi, color: T.secondary }}>
            Batal
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium text-white"
            style={{ background: "#EF4444" }}>
            Ya, Akhiri
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Terra ODP Info Card ---------------------------------------------------
