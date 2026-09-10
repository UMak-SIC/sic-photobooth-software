'use client';

import { useState, type FormEvent } from 'react';
import { parsePublicId } from '@photobooth/public-output';

export function ManualInputForm({ onSubmitCode }: { onSubmitCode: (publicId: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publicId = parsePublicId(value);

    if (!publicId) {
      setError('Enter the 7-character code or the full link from your photo card.');
      return;
    }

    onSubmitCode(publicId);
  }

  return (
    <form onSubmit={handleSubmit} className="portal-panel rounded-[1.25rem] p-5 text-left sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor="photo-code" className="text-base font-bold text-white">
          Enter your code
        </label>
        <span className="font-mono text-[11px] text-[#a8f3dd]">7 characters</span>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-[#b3d9ce]">
        Enter the code shown on the photobooth screen, or ask a staff member for help.
      </p>
      <input
        id="photo-code"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        placeholder="Ab3xYz7"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        className="mt-5 w-full rounded-xl border border-[#2a6457] bg-[#071b17] px-4 py-3.5 font-mono text-base tracking-[0.16em] text-white outline-none placeholder:tracking-[0.16em] placeholder:text-[#779e93] focus:border-[#a8f3dd] focus:ring-2 focus:ring-[#4f9884]"
      />
      {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
      <button type="submit" className="portal-action mt-4 w-full rounded-xl bg-[#a8f3dd] px-4 py-3.5 text-sm font-black text-[#145142] hover:bg-[#c7fbe9]">
        View my photo
      </button>
    </form>
  );
}
