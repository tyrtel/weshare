import { createToken } from './ServiceContainer';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IAuthService } from '../interfaces/IAuthService';
import type { IPaymentService } from '../interfaces/IPaymentService';
import type { IShareService } from '../interfaces/IShareService';
import type { TripSessionStoreApi } from '../../store/tripSessionStore';

export const STORAGE = createToken<IStorageService>('IStorageService');
export const AUTH = createToken<IAuthService>('IAuthService');
export const PAYMENT = createToken<IPaymentService>('IPaymentService');
export const SHARE = createToken<IShareService>('IShareService');
export const TRIP_STORE = createToken<TripSessionStoreApi>('TripSessionStore');
