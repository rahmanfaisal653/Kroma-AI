export interface Plan {
  id: string | number;
  name: string;
  price: number;
  credits: number;
  bonus_credits: number;
  processing_fee: number;
  features: string[];
  popular: boolean;
  billing_cycle: 'one-time' | 'monthly' | 'yearly';
  stripe_product_id: string;
}

export interface PaymentMethod {
  id: string | number;
  name: string;
  type: string;
  icon: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_url: string;
  min_amount: number;
  active: boolean;
}

export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface Transaction {
  id: string | number;
  user_key: string;
  user_email: string;
  user_name: string;
  plan_id: string;
  plan_name: string;
  credits: number;
  bonus_credits: number;
  price: number;
  payment_method: string;
  status: TransactionStatus;
  notes: string;
  created_at?: string;
}

export interface CreateTransactionRequest {
  user_key: string;
  user_email: string;
  user_name: string;
  plan_id: string;
  plan_name: string;
  credits: number;
  bonus_credits: number;
  price: number;
  payment_method: string;
  custom_credits?: number;
}
