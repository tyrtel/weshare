// Branded symbol token — prevents registering the wrong service under a token.
export type ServiceToken<T> = symbol & { readonly _type: T };

export function createToken<T>(description: string): ServiceToken<T> {
  return Symbol(description) as ServiceToken<T>;
}

export class DIError extends Error {
  constructor(token: symbol) {
    super(`No service registered for token: ${String(token)}`);
    this.name = 'DIError';
  }
}

export class ServiceContainer {
  private readonly registry = new Map<symbol, unknown>();

  register<T>(token: ServiceToken<T>, impl: T): void {
    this.registry.set(token, impl);
  }

  resolve<T>(token: ServiceToken<T>): T {
    if (!this.registry.has(token)) {
      throw new DIError(token);
    }
    return this.registry.get(token) as T;
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.registry.has(token);
  }
}
