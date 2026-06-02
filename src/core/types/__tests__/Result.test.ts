import { ok, err, isOk, isErr } from '../Result';
import type { Result } from '../Result';
import type { AppError } from '../AppError';

describe('ok()', () => {
  it('sets ok: true', () => {
    expect(ok('hello').ok).toBe(true);
  });

  it('preserves the value', () => {
    expect(ok(42).value).toBe(42);
  });

  it('works with objects', () => {
    const value = { id: '1', name: 'Jay' };
    expect(ok(value).value).toBe(value);
  });

  it('works with null/undefined values', () => {
    expect(ok(null).value).toBeNull();
    expect(ok(undefined).value).toBeUndefined();
  });
});

describe('err()', () => {
  it('sets ok: false', () => {
    const error: AppError = { kind: 'NetworkError', message: 'timeout' };
    expect(err(error).ok).toBe(false);
  });

  it('preserves the error', () => {
    const error: AppError = { kind: 'AuthError', message: 'not signed in' };
    expect(err(error).error).toBe(error);
  });
});

describe('isOk()', () => {
  it('returns true for Ok results', () => {
    expect(isOk(ok('value'))).toBe(true);
  });

  it('returns false for Err results', () => {
    const error: AppError = { kind: 'NetworkError', message: 'oops' };
    expect(isOk(err(error))).toBe(false);
  });

  it('narrows type so .value is accessible', () => {
    const result: Result<string, AppError> = ok('hello');
    if (isOk(result)) {
      // TypeScript should allow this — if this line compiles the narrowing works
      expect(result.value).toBe('hello');
    }
  });
});

describe('isErr()', () => {
  it('returns false for Ok results', () => {
    expect(isErr(ok(0))).toBe(false);
  });

  it('returns true for Err results', () => {
    const error: AppError = { kind: 'NotFoundError', resource: 'Trip', id: 'abc' };
    expect(isErr(err(error))).toBe(true);
  });

  it('narrows type so .error is accessible', () => {
    const error: AppError = { kind: 'ValidationError', field: 'name', message: 'required' };
    const result: Result<string, AppError> = err(error);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
    }
  });
});

describe('Result round-trip', () => {
  it('ok → isOk true, isErr false', () => {
    const r = ok(99);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it('err → isOk false, isErr true', () => {
    const r = err<AppError>({ kind: 'AuthError', message: 'expired' });
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
  });
});
