export const requestPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getExpoPushTokenAsync   = jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test-mock-token]' });
export const getPermissionsAsync     = jest.fn().mockResolvedValue({ status: 'granted' });
export const addNotificationReceivedListener         = jest.fn(() => ({ remove: jest.fn() }));
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
