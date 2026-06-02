export interface TripMember {
  userId: string;
  tripId: string;
  displayName: string;
  joinedAt: Date;
  isGuest: boolean;
  phone?: string;
  email?: string;
}
