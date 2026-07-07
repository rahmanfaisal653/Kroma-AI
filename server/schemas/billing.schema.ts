import { z } from 'zod';

// --- transactions table ---
export const createTransactionSchema = z.object({
  user_key: z.string().min(1, 'User key is required'),
  user_email: z.string().email('Invalid email').optional().default(''),
  user_name: z.string().optional().default(''),
  plan_id: z.union([z.string(), z.number()]).transform(String),
  plan_name: z.string().optional().default(''),
  credits: z.number().int().min(0).optional().default(0),
  bonus_credits: z.number().int().min(0).optional().default(0),
  price: z.number().min(0).optional().default(0),
  payment_method: z.string().min(1, 'Payment method is required'),
});

// --- billing: buy-credits (admin manual) ---
export const buyCreditsSchema = z.object({
  userKey: z.string().min(1, 'User key is required'),
  amount: z.number().positive('Amount must be positive'),
});

// --- plans table ---
export const planSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  price: z.number().min(0, 'Price is required'),
  credits: z.number().int().min(0).optional().default(0),
  bonus_credits: z.number().int().min(0).optional().default(0),
  processing_fee: z.number().min(0).optional().default(0),
  billing_cycle: z.string().optional().default('one-time'),
  stripe_product_id: z.string().optional().default(''),
  features: z.any().optional(), // JSON object or string array
  popular: z.union([z.boolean(), z.number()]).optional().default(false),
});

// --- payment_methods table ---
export const paymentMethodSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().optional().default('transfer'),
  icon: z.string().optional().default(''),
  bank_name: z.string().optional().default(''),
  account_number: z.string().optional().default(''),
  account_name: z.string().optional().default(''),
  qr_url: z.string().optional().default(''),
  min_amount: z.number().min(0).optional().default(0),
  active: z.union([z.boolean(), z.number()]).optional().default(true),
});
