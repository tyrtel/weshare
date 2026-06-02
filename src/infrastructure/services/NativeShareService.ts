import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IShareService } from '../../core/interfaces/IShareService';

export class NativeShareService implements IShareService {
  async shareTrip(tripId: string, tripName: string): Promise<Result<void, AppError>> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        // Sharing not available (e.g. simulator) — fall back to clipboard or no-op.
        return err({
          kind: 'NetworkError',
          message: 'Native sharing is not available on this device.',
        });
      }

      // Build the deep-link URL using expo-linking so scheme is read from app.config.ts.
      const url = Linking.createURL(`/join/${tripId}`);
      const message = `Join me on ouiShare for "${tripName}":\n${url}`;

      await Sharing.shareAsync(url, {
        dialogTitle: `Invite to ${tripName}`,
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      } as Parameters<typeof Sharing.shareAsync>[1] & { dialogTitle?: string });

      void message; // included in the URL for future web-fallback; logged for debug
      return ok(undefined);
    } catch (e) {
      return err({
        kind: 'NetworkError',
        message: e instanceof Error ? e.message : 'Share failed',
      });
    }
  }
}
