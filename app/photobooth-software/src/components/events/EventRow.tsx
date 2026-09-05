export type Event = {
  id: string;
  name: string;
  date: string;
  operatorName: string;
};

export interface EventRowProps {
  event?: Event;
  title?: string;
  date?: string;
  active?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
}

export function EventRow({
  event,
  title,
  date,
  active = false,
  selected = false,
  selectable = false,
  onClick,
}: EventRowProps) {
  const displayTitle = title ?? event?.name ?? '';
  const displayDate = date ?? event?.date ?? '';
  const displayOperator = event?.operatorName;

  if (selectable || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center justify-between rounded-xl border p-5 text-left transition active:scale-[0.99] ${
          selected
            ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/50'
            : 'border-[#c0e2d8] bg-white hover:border-[#8ec5b6]'
        }`}
      >
        <span>
          <strong className="block text-[17px] text-[#113b33]">{displayTitle}</strong>
          <small className="mt-1 block text-[13px] text-[#5b8176]">
            {displayDate}
            {displayOperator ? ` · ${displayOperator}` : ''}
          </small>
        </span>
        <span
          className={`grid size-6 place-items-center rounded-full border text-xs font-bold ${
            selected ? 'border-[#176a56] bg-[#176a56] text-white' : 'border-[#a7cfc3]'
          }`}
        >
          {selected ? '✓' : ''}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-[#dcefe8] px-6 py-5 last:border-0">
      <span>
        <strong className="block text-[15px]">{displayTitle}</strong>
        <small className="mt-1 block text-[12px] text-[#64877d]">
          {displayDate}
          {displayOperator ? ` · ${displayOperator}` : ''}
        </small>
      </span>
      {active && (
        <span className="rounded-full bg-[#ddf7ee] px-3 py-1 text-[10px] font-bold text-[#21745f]">
          ACTIVE
        </span>
      )}
    </div>
  );
}
