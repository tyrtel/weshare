import React from 'react';
import { render } from '@testing-library/react-native';
import type { RenderOptions, RenderResult } from '@testing-library/react-native';
import { ServiceContext } from '../core/di/ServiceContext';
import { createTestContainer } from '../core/di/testContainer';
import type { ServiceContainer } from '../core/di/ServiceContainer';

// Renders a screen wrapped in the same ServiceContext.Provider every screen expects,
// replacing the makeWrapper() each screen test file previously hand-rolled.
export function renderScreen(
  ui: React.ReactElement,
  container: ServiceContainer = createTestContainer(),
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult & { container: ServiceContainer } {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ServiceContext.Provider value={container}>{children}</ServiceContext.Provider>;
  }
  return { container, ...render(ui, { ...options, wrapper: Wrapper }) };
}
