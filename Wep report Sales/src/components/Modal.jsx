export default function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            ปิด
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t bg-gray-50 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}
