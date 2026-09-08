import { useState, useEffect, type FormEvent } from 'react';
import { type Event } from './EventRow';
import { boothApi } from '../../services/api';

export interface EventSelectScreenProps {
  preview?: boolean;
  onContinue?: (selectedEvent: Event, operatorName: string) => void;
  onBack?: () => void;
  backButtonText?: string;
  initialEventId?: string;
  initialOperatorName?: string;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr || dateStr === 'Event Date') return 'February 22, 2027';

  // If already in "Month Day, Year" format
  if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }

  // Parse YYYY-MM-DD cleanly without timezone offset shift
  const parts = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (parts) {
    const year = parseInt(parts[1], 10);
    const monthIndex = parseInt(parts[2], 10) - 1;
    const day = parseInt(parts[3], 10);
    const date = new Date(year, monthIndex, day);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return dateStr;
}

const DEFAULT_EVENTS: Event[] = [
  {
    id: '1',
    name: 'Title of the Event',
    description: 'Short Description',
    date: '2027-02-22',
    operatorName: 'Operator Name',
  },
  {
    id: '2',
    name: 'Title of the Event',
    description: 'Short Description',
    date: '2027-02-22',
    operatorName: 'Operator Name',
  },
];

const STRIPE_COLORS = [
  '#7ec3e6', // Sky blue
  '#8e2b52', // Deep berry/maroon
  '#276d4e', // SIC green
  '#e6983b', // Amber
  '#805ad5', // Purple
  '#319795', // Teal
];

export function EventSelectScreen({
  preview = false,
  onContinue,
  onBack,
  backButtonText = 'Back',
  initialEventId,
  initialOperatorName,
}: EventSelectScreenProps) {
  const [events, setEvents] = useState<Event[]>(DEFAULT_EVENTS);
  const [selectedId, setSelectedId] = useState<string>(initialEventId || '2');
  const [operatorName, setOperatorName] = useState<string>(initialOperatorName || 'CHARLES TOGLE');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createOperator, setCreateOperator] = useState(initialOperatorName || 'CHARLES TOGLE');
  const [createError, setCreateError] = useState('');
  const [loading, setLoading] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (preview) return;
    boothApi
      .listEvents()
      .then((loaded) => {
        if (Array.isArray(loaded) && loaded.length > 0) {
          setEvents(loaded);
          const initialExists = initialEventId && loaded.some((e) => e.id === initialEventId);
          if (initialExists) {
            setSelectedId(initialEventId);
            const found = loaded.find((e) => e.id === initialEventId);
            if (initialOperatorName) {
              setOperatorName(initialOperatorName);
            } else if (found?.operatorName) {
              setOperatorName(found.operatorName);
            }
          } else {
            setSelectedId((prev) => (loaded.some((e) => e.id === prev) ? prev : loaded[0].id));
            if (initialOperatorName) {
              setOperatorName(initialOperatorName);
            } else if (loaded[0].operatorName) {
              setOperatorName(loaded[0].operatorName);
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load events from backend, using defaults:', err);
      });
  }, [preview, initialEventId, initialOperatorName]);

  const selectedEvent = events.find((e) => e.id === selectedId) || events[0] || DEFAULT_EVENTS[0];
  const activeOperator = selectedEvent?.operatorName || operatorName || 'CHARLES TOGLE';

  const handleContinue = () => {
    if (onContinue && selectedEvent) {
      onContinue(selectedEvent, activeOperator);
    }
  };

  const handleConfirmDelete = async () => {
    if (!eventToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      try {
        await boothApi.deleteEvent(eventToDelete.id);
      } catch (err) {
        console.warn('Backend delete event call failed or not connected, deleting locally:', err);
      }
      const updatedEvents = events.filter((e) => e.id !== eventToDelete.id);
      setEvents(updatedEvents);
      if (selectedId === eventToDelete.id) {
        if (updatedEvents.length > 0) {
          setSelectedId(updatedEvents[0].id);
          if (updatedEvents[0].operatorName) {
            setOperatorName(updatedEvents[0].operatorName);
          }
        } else {
          setSelectedId('');
        }
      }
      setEventToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete event.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError('');
    setLoading(true);
    try {
      const created = await boothApi.createEvent(
        createName,
        createDate,
        createOperator,
        createDescription.trim() || undefined,
      );
      setEvents((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setOperatorName(created.operatorName || createOperator);
      setIsCreating(false);
      setCreateName('');
      setCreateDescription('');
      setCreateDate('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create event.';
      setCreateError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f4f6f5] select-none font-['Nunito',sans-serif]">
      {/* Centered 1024x768 Kiosk Display Frame */}
      <div className="relative flex h-[800px] max-h-[800px] w-full max-w-[1180px] flex-col justify-between overflow-hidden px-6 py-4 sm:px-10 sm:py-5 text-[#1a202c]">
        {/* Top Header Row (Constrained inside max-w-5xl, Back button on the left of the container) */}
        <div className="relative mx-auto flex w-full max-w-5xl shrink-0 items-start justify-center">
          {/* Left: Back Button inside the max-w-5xl container */}
          {onBack && !preview && (
            <div className="absolute left-0 top-0 sm:top-1 z-10">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-base sm:text-lg font-bold text-[#2d3748] hover:text-[#276d4e] transition-colors cursor-pointer active:scale-95"
              >
                <svg
                  className="size-5 sm:size-6 stroke-current stroke-[2.5]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span>
                  {backButtonText.toLowerCase().includes('welcome screen')
                    ? 'Back'
                    : backButtonText.replace(/^[←\s]+/, '') || 'Back'}
                </span>
              </button>
            </div>
          )}

          {/* Center: Brand & Heading spanning the whole width of the container */}
          <div className="flex w-full flex-col items-center text-center px-16 sm:px-20 mt-8">
            <img
              src="/assets/images/logo.svg"
              alt="University of Makati - SIC Logo"
              className="size-12 sm:size-14 md:size-16 object-contain drop-shadow-sm transition-transform hover:scale-105"
            />
            <p className="mt-1.5 text-sm sm:text-base font-semibold tracking-tight text-[#4a5568] uppercase">
              SIC PHOTOBOOTH
            </p>
            <h1 className="w-full text-2xl sm:text-3xl md:text-4xl lg:text-[2.65rem] font-bold tracking-tight text-[#1d1f26]">
              Which event are you operating?
            </h1>
          </div>
        </div>

        {/* Main Content: Permanent 2-Column Split (Never collapses so operator stays on right side) */}
        <div className="mx-auto my-auto grid w-full max-w-5xl flex-1 grid-cols-[1.75fr_1fr] items-center gap-8 lg:gap-12 min-h-0 py-1">
          {/* Left Column: Event Cards List */}
          <div className="flex w-full flex-col overflow-hidden">
            <div className="w-full flex flex-col gap-3.5 overflow-y-auto overflow-x-hidden pl-5 pr-1 py-1 max-h-[440px] event-list-scroll">
              {events.map((event, idx) => {
                const isSelected = event.id === selectedId;
                const stripeColor = STRIPE_COLORS[idx % STRIPE_COLORS.length];

                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      setSelectedId(event.id);
                      if (event.operatorName) setOperatorName(event.operatorName);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedId(event.id);
                        if (event.operatorName) setOperatorName(event.operatorName);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    className={`group relative flex w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white text-left transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'border-2 border-[#276d4e] shadow-[0_6px_20px_rgba(39,109,78,0.12)]'
                        : 'border-2 border-transparent shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-[#a8d5c5] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]'
                    }`}
                  >
                    {/* Top Colored Stripe */}
                    <div
                      className="h-3.5 w-full rounded-t-xl"
                      style={{ backgroundColor: stripeColor }}
                    />

                    {/* Card Body */}
                    <div className="relative p-4 sm:p-5 pt-3 sm:pt-3.5">
                      {/* Delete Button (Top Right of Card) */}
                      {!preview && (
                        <button
                          type="button"
                          title="Delete event"
                          aria-label={`Delete event ${event.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEventToDelete(event);
                            setDeleteError('');
                          }}
                          className="absolute top-2.5 right-2.5 z-10 flex size-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer active:scale-90"
                        >
                          <svg
                            className="size-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}

                      <h3 className="text-lg sm:text-2xl font-bold tracking-tight text-[#1e293b] leading-tight pr-8">
                        {event.name}
                      </h3>
                      <p className="mt-0.5 text-sm font-semibold text-[#64748b] line-clamp-2 pr-6">
                        {event.description || 'Short Description'}
                      </p>

                      {/* Metadata Footer */}
                      <div className="mt-5 flex items-center justify-between text-sm font-semibold text-[#334155]">
                        {/* Left: Date */}
                        <div className="flex items-center gap-2">
                          <img
                            src="/assets/images/calendar-icon.png"
                            alt="Calendar icon"
                            className="size-4 sm:size-4.5 object-contain"
                          />
                          <span>{formatDisplayDate(event.date)}</span>
                        </div>

                        {/* Right: Operator */}
                        <div className="flex items-center gap-2">
                          <img
                            src="/assets/images/operator-icon.png"
                            alt="Operator icon"
                            className="size-4 sm:size-4.5 object-contain"
                          />
                          <span>{event.operatorName || operatorName || 'Operator Name'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Robot Operator Mascot with Built-in Dialogue Box */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-[280px] sm:w-[310px] md:w-[280px] drop-shadow-md select-none">
              <img
                src="/assets/images/robot-operator.svg"
                alt="SIC Robot Operator"
                className="w-full h-auto object-contain pointer-events-none select-none"
              />
              {/* Text positioned inside the dialogue box of the actual robot mascot image */}
              <div
                className="absolute top-[4%] left-[16%] right-[10%] h-[23%] flex flex-col items-center justify-center text-center pointer-events-none"
                style={{
                  fontFamily: "'PressStart2P', 'Arcade Gamer', monospace",
                }}
              >
                <p className="text-[8.5px] sm:text-[9.5px] md:text-lg font-normal leading-[1.3] tracking-wider text-[#276d4e] uppercase line-clamp-2 px-1">
                  {activeOperator}
                </p>
                <p className="mt-0.5 text-[7.5px] sm:text-[8px] md:text-sm font-normal tracking-wider text-black uppercase">
                  IS IN CHARGED
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="relative z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between pt-2 pb-1">
        {/* + New Event Button */}
        {!preview && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="group flex items-center gap-2.5 rounded-full border-2 border-[#008f50] bg-none px-7 py-2 text-base sm:text-lg font-bold text-[#008f50] shadow-sm transition-all hover:bg-[#edf7f2] hover:shadow-md active:scale-95 cursor-pointer"
          >
            <span className="text-2xl leading-none font-bold group-hover:scale-110 transition-transform">
              +
            </span>
            <span>New Event</span>
          </button>
        )}

        {/* Continue Button */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading || !selectedEvent}
          className="ml-auto flex items-center gap-3 rounded-full bg-[#276d4e] px-8 py-3 text-xl sm:text-2xl font-bold text-white shadow-[0_6px_20px_rgba(39,109,78,0.32)] transition-all hover:bg-[#1f5940] hover:shadow-[0_8px_25px_rgba(39,109,78,0.4)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span>Continue</span>
          <img
            src="/assets/images/like-icon.svg"
            alt="Thumbs up"
            className="size-6 sm:size-8 object-contain"
          />
        </button>
      </div>
      </div>

      {/* Create Event Modal Dialog */}
      {isCreating && !preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-['Nunito',sans-serif]">
          <div className="relative w-full max-w-[700px] rounded-[32px] bg-white px-9 py-8 sm:px-11 sm:py-9 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <h2 className="text-center text-3xl sm:text-[36px] font-extrabold tracking-tight text-[#1a202c]">
              What event is in your mind?
            </h2>

            <form onSubmit={handleCreateSubmit} className="mt-6 flex flex-col gap-4">
              {/* Event Name */}
              <div>
                <label className="block text-base sm:text-[17px] font-bold text-[#2d3748]">
                  Event Name
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-black bg-white px-3.5 text-base font-semibold text-[#1a202c] outline-none transition focus:ring-2 focus:ring-[#276d4e]/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-base sm:text-[17px] font-bold text-[#2d3748]">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="mt-1.5 w-full resize-none rounded-xl border border-black bg-white p-3 text-base font-semibold text-[#1a202c] outline-none transition focus:ring-2 focus:ring-[#276d4e]/30"
                />
              </div>

              {/* Event Date & Who's the Operator? Side by side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Event Date */}
                <div>
                  <div className="flex items-center gap-1.5 text-base sm:text-[17px] font-bold text-[#2d3748]">
                    <span>Event Date</span>
                    <img
                      src="/assets/images/calendar-icon.png"
                      alt=""
                      aria-hidden="true"
                      className="size-4.5 object-contain inline-block"
                    />
                  </div>
                  <input
                    type="date"
                    required
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-black bg-white px-3 text-sm sm:text-base font-semibold text-[#1a202c] outline-none transition focus:ring-2 focus:ring-[#276d4e]/30"
                  />
                </div>

                {/* Who's the Operator? */}
                <div>
                  <div className="flex items-center gap-1.5 text-base sm:text-[17px] font-bold text-[#2d3748]">
                    <span>Who&apos;s the Operator?</span>
                    <img
                      src="/assets/images/operator-icon.png"
                      alt=""
                      aria-hidden="true"
                      className="size-4.5 object-contain inline-block"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={createOperator}
                    onChange={(e) => setCreateOperator(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-black bg-white px-3.5 text-sm sm:text-base font-semibold text-[#1a202c] outline-none transition focus:ring-2 focus:ring-[#276d4e]/30"
                  />
                </div>
              </div>

              {createError && (
                <p className="rounded-lg bg-red-50 p-2.5 text-xs font-bold text-red-600">
                  {createError}
                </p>
              )}

              {/* Bottom Actions: Back button on left, Save Event on right */}
              <div className="mt-4 flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1a202c] bg-white px-6 py-2 text-base font-extrabold text-[#1a202c] transition-all hover:bg-gray-50 active:scale-95 cursor-pointer"
                >
                  <svg
                    className="size-4.5 stroke-current stroke-[3]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-[#24674a] px-8 py-2.5 text-base sm:text-lg font-bold text-white shadow-md transition-all hover:bg-[#1c533b] hover:shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-['Nunito',sans-serif]">
          <div className="relative w-full max-w-[440px] rounded-[28px] bg-white px-7 py-6 sm:px-8 sm:py-7 shadow-[0_20px_60px_rgba(0,0,0,0.18)] text-center">
            {/* Red Warning/Trash Icon */}
            <div className="mx-auto mb-3.5 flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg
                className="size-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>

            <h3 className="text-2xl font-extrabold tracking-tight text-[#1a202c]">
              Delete Event?
            </h3>
            <p className="mt-2 text-sm sm:text-base font-semibold text-[#64748b]">
              Are you sure you want to delete <span className="font-bold text-[#1e293b]">&ldquo;{eventToDelete.name}&rdquo;</span>? This action cannot be undone.
            </p>

            {deleteError && (
              <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-600">
                {deleteError}
              </p>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setEventToDelete(null);
                  setDeleteError('');
                }}
                className="w-1/2 rounded-full border-2 border-gray-300 bg-white py-2 text-base font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="w-1/2 rounded-full bg-red-600 py-2 text-base font-bold text-white shadow-md transition hover:bg-red-700 hover:shadow-lg active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
