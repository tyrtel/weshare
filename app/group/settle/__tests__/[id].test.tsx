import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'g1' }),
  Stack: { Screen: () => null },
}));

jest.mock('../../../../src/features/groups/hooks/useGroupDetail', () => ({
  useGroupDetail: jest.fn(),
}));

import GroupSettlementScreen from '../[id]';
import { useGroupDetail } from '../../../../src/features/groups/hooks/useGroupDetail';
import { renderScreen } from '../../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../../src/core/di/testContainer';
import { SPLIT_REQUEST_REPO, TRIP_STORE } from '../../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../../src/__testUtils__/factories';
import type { ServiceContainer } from '../../../../src/core/di/ServiceContainer';

const mockUseGroupDetail = useGroupDetail as jest.Mock;

const MEMBERS = [
  groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
  groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
];
const GROUP = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', members: MEMBERS });

beforeEach(() => {
  mockBack.mockClear();
});

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<GroupSettlementScreen />, container);
}

describe('GroupSettlementScreen', () => {
  it('renders each suggested transfer with the correctly summed amount', () => {
    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
    });

    render();

    expect(screen.getByText('Bob → Alice')).toBeTruthy();
    expect(screen.getByText('€15.00')).toBeTruthy();
    expect(screen.getByText('+€15.00')).toBeTruthy();
    expect(screen.getByText('−€15.00')).toBeTruthy();
  });

  it('confirming "Settle everything" records a completed payment for each settlement and navigates back', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(GROUP);

    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
    });

    render(container);

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.[1]?.onPress?.();
    });

    fireEvent.press(screen.getByText('Settle everything'));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup('g1');
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value).toHaveLength(1);
    expect(stored.value[0]).toMatchObject({ payerUserId: 'u2', requesterUserId: 'u1', amountCents: 1500, status: 'paid' });
  });

  it('shows the all-settled state when there are no outstanding transfers', () => {
    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [],
      memberBalances: [
        { userId: 'u1', balanceCents: 0 },
        { userId: 'u2', balanceCents: 0 },
      ],
    });

    render();

    expect(screen.getByText('Everyone is settled up.')).toBeTruthy();
    expect(screen.queryByText('Settle everything')).toBeNull();
  });
});
