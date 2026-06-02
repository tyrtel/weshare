import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SplitStatusBadge } from '../SplitStatusBadge';
import type { SplitRequestStatus } from '../../../core/models/SplitRequest';

const STATUSES: { status: SplitRequestStatus; label: string }[] = [
  { status: 'created',      label: 'Created'  },
  { status: 'request_sent', label: 'Sent'     },
  { status: 'pending',      label: 'Pending'  },
  { status: 'completed',    label: 'Paid'     },
  { status: 'declined',     label: 'Declined' },
  { status: 'expired',      label: 'Expired'  },
];

describe('SplitStatusBadge — label text', () => {
  it.each(STATUSES)('renders "$label" for status "$status"', ({ status, label }) => {
    render(<SplitStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('SplitStatusBadge — accessibility', () => {
  it.each(STATUSES)('has accessible label for status "$status"', ({ status, label }) => {
    render(<SplitStatusBadge status={status} />);
    expect(screen.getByLabelText(`Payment status: ${label}`)).toBeTruthy();
  });
});
