// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventSelectScreen } from './EventSelectScreen';
import { boothApi, type EventItem } from '../../services/api';

describe('EventSelectScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loaded events with their real descriptions', async () => {
    const mockEvents: EventItem[] = [
      {
        id: 'e-1',
        name: 'Tech Summit 2026',
        description: 'Annual gathering of students and alumni in tech',
        date: '2026-10-15',
        operatorName: 'Alex Cruz',
      },
    ];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);

    render(<EventSelectScreen />);

    expect(await screen.findByText('Tech Summit 2026')).toBeDefined();
    expect(screen.getByText('Annual gathering of students and alumni in tech')).toBeDefined();
  });

  it('creates an event with short description and displays the new card', async () => {
    const mockEvents: EventItem[] = [];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);

    const createSpy = vi.spyOn(boothApi, 'createEvent').mockResolvedValue({
      id: 'e-created',
      name: 'Hackathon 2026',
      description: '24-hour innovation marathon',
      date: '2026-11-20',
      operatorName: 'Jane Doe',
    });

    render(<EventSelectScreen />);

    // Open New Event modal
    const newEventBtn = screen.getByRole('button', { name: /\+.*New Event/i });
    fireEvent.click(newEventBtn);

    expect(screen.getByText('What event is in your mind?')).toBeDefined();

    // Fill the form (inputs)
    const textInputs = screen.getAllByRole('textbox');
    // Name is text input, description is textarea, operator is text input
    fireEvent.change(textInputs[0], { target: { value: 'Hackathon 2026' } });
    fireEvent.change(textInputs[1], { target: { value: '24-hour innovation marathon' } });
    fireEvent.change(textInputs[2], { target: { value: 'Jane Doe' } });

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-11-20' } });

    // Submit form
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        'Hackathon 2026',
        expect.any(String),
        'Jane Doe',
        '24-hour innovation marathon',
      );
      expect(screen.getByText('Hackathon 2026')).toBeDefined();
      expect(screen.getByText('24-hour innovation marathon')).toBeDefined();
    });
  });

  it('opens delete confirmation modal and cancels deletion', async () => {
    const mockEvents: EventItem[] = [
      {
        id: 'e-1',
        name: 'Tech Summit 2026',
        description: 'Annual gathering of students and alumni in tech',
        date: '2026-10-15',
        operatorName: 'Alex Cruz',
      },
    ];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);

    render(<EventSelectScreen />);

    expect(await screen.findByText('Tech Summit 2026')).toBeDefined();

    // Click delete button
    const deleteBtn = screen.getByRole('button', { name: /delete event tech summit 2026/i });
    fireEvent.click(deleteBtn);

    // Modal should be visible
    expect(screen.getByText('Delete Event?')).toBeDefined();
    expect(
      screen.getByText((content) => content.includes('Are you sure you want to delete')),
    ).toBeDefined();

    // Click Cancel button
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Modal should close and event should still exist
    expect(screen.queryByText('Delete Event?')).toBeNull();
    expect(screen.getByText('Tech Summit 2026')).toBeDefined();
  });

  it('opens delete confirmation modal and confirms deletion', async () => {
    const mockEvents: EventItem[] = [
      {
        id: 'e-1',
        name: 'Tech Summit 2026',
        description: 'Annual gathering of students and alumni in tech',
        date: '2026-10-15',
        operatorName: 'Alex Cruz',
      },
    ];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);
    const deleteSpy = vi.spyOn(boothApi, 'deleteEvent').mockResolvedValue();

    render(<EventSelectScreen />);

    expect(await screen.findByText('Tech Summit 2026')).toBeDefined();

    // Click delete button
    const deleteBtn = screen.getByRole('button', { name: /delete event tech summit 2026/i });
    fireEvent.click(deleteBtn);

    // Confirm delete in modal
    const confirmDeleteBtn = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('e-1');
      expect(screen.queryByText('Tech Summit 2026')).toBeNull();
    });
  });
});
