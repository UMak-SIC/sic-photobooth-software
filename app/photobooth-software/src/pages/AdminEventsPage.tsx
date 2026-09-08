import { useEffect, useState, type FormEvent } from 'react';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { EventRow, type Event } from '../components/events/EventRow';
import { boothApi } from '../services/api';

export function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    boothApi
      .listEvents()
      .then((loaded) => setEvents(loaded))
      .catch(() => setError('Could not load events.'));
  }, []);

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const created = await boothApi.createEvent(
        name,
        date,
        operatorName,
        description.trim() || undefined,
      );
      setEvents((current) => [created, ...current]);
      setName('');
      setDescription('');
      setDate('');
      setOperatorName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create event.');
    }
  };

  return (
    <section aria-labelledby="events-title" className="p-10">
      <div className="grid grid-cols-[1fr_230px] gap-8">
        <div>
          <h2 className="text-[25px] font-black tracking-[-0.05em]" id="events-title">
            Current events
          </h2>
          <div className="mt-7 overflow-hidden rounded-xl border border-[#cde7dd] bg-white">
            {events.map((event, index) => (
              <EventRow active={index === 0} event={event} key={event.id} />
            ))}
            {!events.length && <p className="p-6 text-sm text-[#64877d]">No events yet.</p>}
          </div>
        </div>
        <CreateEventForm
          date={date}
          description={description}
          error={error}
          name={name}
          onDateChange={setDate}
          onDescriptionChange={setDescription}
          onNameChange={setName}
          onOperatorNameChange={setOperatorName}
          onSubmit={createEvent}
          operatorName={operatorName}
        />
      </div>
    </section>
  );
}
