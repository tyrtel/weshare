import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IShareService } from '../../core/interfaces/IShareService';

export class NativeShareService implements IShareService {
  async shareTrip(_tripId: string, tripName: string, inviteToken: string): Promise<Result<void, AppError>> {
    try {
      const url     = Linking.createURL(`/join/${inviteToken}`);
      const message = `Join me on ouiShare for "${tripName}": ${url}`;
      await Share.share({ message });
      return ok(undefined);
    } catch (e) {
      return err({
        kind: 'NetworkError',
        message: e instanceof Error ? e.message : 'Share failed',
      });
    }
  }
}
