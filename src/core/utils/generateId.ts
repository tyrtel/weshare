// crypto.randomUUID() is available globally in:
//   - Hermes (React Native 0.73+)
//   - Node.js 15+ (Jest environment)
export function generateId(): string {
  return crypto.randomUUID();
}
