export type Event = {
  id: string;
  name: string;
  date: string;
  operatorName: string;
};

export function EventRow({ event, active = false }: { event: Event; active?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[#dcefe8] px-6 py-5 last:border-0">
      <span>
        <strong className="block text-[15px]">{event.name}</strong>
        <small className="mt-1 block text-[12px] text-[#64877d]">
          {event.date} · {event.operatorName}
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
