import { useState, useEffect, type FormEvent } from 'react';
import { EventRow, type Event } from './EventRow';
import { CreateEventForm } from './CreateEventForm';
import { boothApi } from '../../services/api';

export interface EventSelectScreenProps {
  preview?: boolean;
  onContinue?: (selectedEvent: Event, operatorName: string) => void;
}

const DEFAULT_EVENTS: Event[] = [
  { id: '1', name: 'SIC General Assembly', date: 'May 24, 2026', operatorName: 'Mika Santos' },
  { id: '2', name: 'College Week 2026', date: 'June 18, 2026', operatorName: 'J. Domingo' },
];

export function EventSelectScreen({ preview = false, onContinue }: EventSelectScreenProps) {
  const [events, setEvents] = useState<Event[]>(DEFAULT_EVENTS);
  const [selectedId, setSelectedId] = useState<string>('1');
  const [operatorName, setOperatorName] = useState<string>('Mika Santos');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createName, setCreateName] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createOperator, setCreateOperator] = useState('Mika Santos');
  const [createError, setCreateError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (preview) return;
    boothApi
      .listEvents()
      .then((loaded) => {
        if (Array.isArray(loaded) && loaded.length > 0) {
          setEvents(loaded);
          setSelectedId(loaded[0].id);
          if (loaded[0].operatorName) {
            setOperatorName(loaded[0].operatorName);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load events from backend, using defaults:', err);
      });
  }, [preview]);

  const selectedEvent = events.find((e) => e.id === selectedId) || events[0] || DEFAULT_EVENTS[0];

  const handleContinue = () => {
    if (onContinue && selectedEvent) {
      onContinue(selectedEvent, operatorName);
    }
  };

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError('');
    setLoading(true);
    try {
      const created = await boothApi.createEvent(createName, createDate, createOperator);
      setEvents((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setOperatorName(created.operatorName || createOperator);
      setIsCreating(false);
      setCreateName('');
      setCreateDate('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create event.';
      setCreateError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full items-center justify-center overflow-hidden bg-[#ecfff8] text-[#113b33]">
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[1fr_300px] gap-14 px-14 py-10">
        <div>
          <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">EVENT DETAILS</p>
          <h4 className="mt-3 text-[44px] font-black tracking-[-0.06em]">Select the event.</h4>

          {isCreating && !preview ? (
            <div className="mt-6">
              <CreateEventForm
                name={createName}
                date={createDate}
                operatorName={createOperator}
                error={createError}
                onNameChange={setCreateName}
                onDateChange={setCreateDate}
                onOperatorNameChange={setCreateOperator}
                onSubmit={handleCreateSubmit}
              />
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="mt-3 text-[13px] font-bold text-[#56796f] hover:text-[#113b33] underline"
              >
                ← Back to event list
              </button>
            </div>
          ) : (
            <div className="mt-9 grid gap-3">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={event.id === selectedId}
                  onClick={() => {
                    setSelectedId(event.id);
                    if (event.operatorName) setOperatorName(event.operatorName);
                  }}
                  selectable
                />
              ))}

              {!preview && (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="mt-2 w-fit text-[14px] font-bold text-[#146a56] underline underline-offset-4 hover:text-[#0d473a]"
                >
                  Create a new event
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col justify-between rounded-2xl bg-[#d9f7ed] p-7">
          <div>
            <p className="text-[12px] font-bold tracking-wide text-[#28715f]">ACTIVE OPERATOR</p>
            <p className="mt-3 text-[21px] font-black text-[#113b33]">{operatorName}</p>
            <p className="mt-10 text-[13px] leading-5 text-[#4d756b]">
              Event selection keeps every output, print record, and public QR connected to the right
              day.
            </p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={handleContinue}
              disabled={loading || !selectedEvent}
              className="w-full rounded-xl bg-[#146a56] px-6 py-3 text-[14px] font-bold text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)] transition hover:bg-[#0f5444] active:scale-[0.98] disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

