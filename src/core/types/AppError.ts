// Typed error variants returned inside Err<AppError>.
// Use the `kind` discriminant to narrow in switch/if chains.

export type NetworkError = {
  readonly kind: 'NetworkError';
  readonly message: string;
  readonly statusCode?: number;
};

export type NotFoundError = {
  readonly kind: 'NotFoundError';
  readonly resource: string; // e.g. 'Trip', 'Expense'
  readonly id: string;
};

export type AuthError = {
  readonly kind: 'AuthError';
  readonly message: string;
};

export type ValidationError = {
  readonly kind: 'ValidationError';
  readonly field: string;
  readonly message: string;
};

export type AppError = NetworkError | NotFoundError | AuthError | ValidationError;
