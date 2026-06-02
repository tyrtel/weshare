import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { IBANInputField } from '../IBANInputField';

// Valid French IBAN (checksum-correct per ISO 13616 mod-97)
const VALID_FR_IBAN_RAW    = 'FR7630006000011234567890189';
const VALID_FR_IBAN_FORMATTED = 'FR76 3000 6000 0112 3456 7890 189';

function setup(value = '', onChange = jest.fn()) {
  const { rerender } = render(<IBANInputField value={value} onChange={onChange} />);
  const input = screen.getByLabelText('IBAN input');
  return { input, rerender, onChange };
}

// ── Initial render ─────────────────────────────────────────────────────────────

describe('IBANInputField — initial render', () => {
  it('formats the initial value with spaces', () => {
    setup(VALID_FR_IBAN_RAW);
    expect(screen.getByLabelText('IBAN input').props.value).toBe(VALID_FR_IBAN_FORMATTED);
  });

  it('shows IBAN valid text when initial value is a valid IBAN', () => {
    setup(VALID_FR_IBAN_RAW);
    expect(screen.getByText('IBAN valid')).toBeTruthy();
  });

  it('shows no error when the field starts empty', () => {
    setup('');
    expect(screen.queryByText('Invalid IBAN — please check and re-enter')).toBeNull();
    expect(screen.queryByText('IBAN valid')).toBeNull();
  });
});

// ── Typing (no reformat while focused) ────────────────────────────────────────

describe('IBANInputField — typing behaviour', () => {
  it('calls onChange with the stripped raw value and validity on each keystroke', () => {
    const onChange = jest.fn();
    const { input } = setup('', onChange);

    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'FR76');

    expect(onChange).toHaveBeenCalledWith('FR76', false);
  });

  it('does not reformat the displayed value mid-typing', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    // Type without spaces — should stay as-typed, no spaces injected.
    fireEvent.changeText(input, 'FR763000');

    expect(input.props.value).toBe('FR763000');
  });

  it('uppercases and strips non-IBAN characters', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'fr76!@#3000');

    // Non-IBAN chars stripped, letters uppercased; spaces preserved from original
    expect(input.props.value).toBe('FR763000');
  });

  it('does not show the error message while the user is still typing', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'FR76');

    expect(screen.queryByText('Invalid IBAN — please check and re-enter')).toBeNull();
  });
});

// ── Blur (format + validate) ───────────────────────────────────────────────────

describe('IBANInputField — blur behaviour', () => {
  it('formats the value with spaces on blur', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, VALID_FR_IBAN_RAW);
    fireEvent(input, 'blur');

    expect(input.props.value).toBe(VALID_FR_IBAN_FORMATTED);
  });

  it('shows "IBAN valid" after blur when value is valid', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, VALID_FR_IBAN_RAW);
    fireEvent(input, 'blur');

    expect(screen.getByText('IBAN valid')).toBeTruthy();
  });

  it('shows the error message on blur when the IBAN is invalid', () => {
    const { input } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'FR761234'); // too short
    fireEvent(input, 'blur');

    expect(screen.getByText('Invalid IBAN — please check and re-enter')).toBeTruthy();
  });

  it('does not reformat when parent value changes while focused', () => {
    const { input, rerender } = setup('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'FR763000');

    // Simulate parent updating the value prop (e.g. via onChange round-trip).
    rerender(<IBANInputField value="FR763000" onChange={jest.fn()} />);

    // The input should still show the as-typed text, not a freshly formatted version.
    expect(input.props.value).toBe('FR763000');
  });
});
