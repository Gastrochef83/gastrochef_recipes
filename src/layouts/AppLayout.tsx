<div className="p-4 border-b border-neutral-200">
  <div className="text-xs font-semibold text-neutral-500 mb-2">
    MODE
  </div>

  <div className="relative flex rounded-xl bg-neutral-100 p-1">
    <div
      className={`absolute top-1 bottom-1 w-1/2 rounded-lg bg-white shadow-sm transition-all duration-300 ${
        mode === 'kitchen' ? 'left-1' : 'left-1/2'
      }`}
    />

    <button
      onClick={() => setMode('kitchen')}
      className={`relative flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
        mode === 'kitchen' ? 'text-black' : 'text-neutral-500'
      }`}
    >
      Kitchen
    </button>

    <button
      onClick={() => setMode('mgmt')}
      className={`relative flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
        mode === 'mgmt' ? 'text-black' : 'text-neutral-500'
      }`}
    >
      Mgmt
    </button>
  </div>
</div>
