// Mock for expo-contacts used in Jest tests and simulation mode.

export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const Fields = {
  PhoneNumbers: 'phoneNumbers',
  Emails: 'emails',
  Name: 'name',
} as const;

export const requestPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  granted: true,
  canAskAgain: true,
  expires: 'never',
});

export const getContactsAsync = jest.fn().mockResolvedValue({
  data: [
    {
      id: 'c1',
      name: 'Alice Martin',
      phoneNumbers: [{ number: '+33612345678', label: 'mobile' }],
      emails: [{ email: 'alice@example.com', label: 'home' }],
    },
    {
      id: 'c2',
      name: 'Bob Dupont',
      phoneNumbers: [{ number: '+33698765432', label: 'mobile' }],
      emails: [],
    },
    {
      id: 'c3',
      name: 'Claire Moreau',
      phoneNumbers: [],
      emails: [{ email: 'claire@example.com', label: 'work' }],
    },
  ],
  hasNextPage: false,
  hasPreviousPage: false,
});

export default {
  PermissionStatus,
  Fields,
  requestPermissionsAsync,
  getContactsAsync,
};
