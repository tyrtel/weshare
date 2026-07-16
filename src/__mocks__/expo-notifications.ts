export const requestPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getExpoPushTokenAsync   = jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test-mock-token]' });
export const getPermissionsAsync     = jest.fn().mockResolvedValue({ status: 'granted' });
