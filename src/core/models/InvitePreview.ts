// What someone holding an invite token may see before joining.
export interface InvitePreview {
  id: string;
  name: string;
  // Past its lifetime or the trip is closed. False for a caller who is already
  // a member or matches a guest placeholder: they may still join.
  expired: boolean;
}
