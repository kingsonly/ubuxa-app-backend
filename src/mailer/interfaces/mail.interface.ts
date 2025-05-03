export interface IMail {
  to: string;
  subject: string;
  [key: string]: any;
  userId?: string;
}
