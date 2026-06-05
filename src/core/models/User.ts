export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  isGuest?: boolean;
  createdAt: Date;
}
