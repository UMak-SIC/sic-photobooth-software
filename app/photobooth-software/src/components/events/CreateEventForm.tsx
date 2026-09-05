import type { FormEvent } from 'react';

type CreateEventFormProps = {
  name: string;
  date: string;
  operatorName: string;
  error: string;
  onNameChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onOperatorNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateEventForm({
  name,
  date,
  operatorName,
  error,
  onNameChange,
  onDateChange,
  onOperatorNameChange,
  onSubmit,
}: CreateEventFormProps) {
  return (
    <form className="rounded-xl bg-[#ddf7ee] p-6" onSubmit={onSubmit}>
      <p className="text-[11px] font-bold tracking-wide text-[#26715e]">CREATE EVENT</p>
      <label className="mt-5 block text-[12px] font-bold">
        Event name
        <input
          className="mt-2 w-full rounded-lg border border-[#98cdbd] bg-white px-3 py-2"
          onChange={(event) => onNameChange(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="mt-4 block text-[12px] font-bold">
        Event date
        <input
          className="mt-2 w-full rounded-lg border border-[#98cdbd] bg-white px-3 py-2"
          onChange={(event) => onDateChange(event.target.value)}
          required
          type="date"
          value={date}
        />
      </label>
      <label className="mt-4 block text-[12px] font-bold">
        Operator name
        <input
          className="mt-2 w-full rounded-lg border border-[#98cdbd] bg-white px-3 py-2"
          onChange={(event) => onOperatorNameChange(event.target.value)}
          required
          value={operatorName}
        />
      </label>
      {error && (
        <p aria-live="polite" className="mt-4 text-xs font-semibold text-[#b64d47]">
          {error}
        </p>
      )}
      <button
        className="mt-5 rounded-lg bg-[#146a56] px-4 py-2 text-[12px] font-bold text-white"
        type="submit"
      >
        Save event
      </button>
    </form>
  );
}
