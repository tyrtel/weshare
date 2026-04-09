export interface Participant {
  id: string;
  name: string;
  /** Payment handle (e.g. @venmo_user), phone number, or email. */
  contactInfo: string;
}
