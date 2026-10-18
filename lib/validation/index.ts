import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const dollarsToCents = z.coerce
  .number({ invalid_type_error: 'Enter an amount' })
  .positive('Enter an amount')
  .max(100_000)
  .transform((v) => Math.round(v * 100));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export const signupSchema = z.object({
  name: trimmed(80).min(1, 'Enter your name'),
  email: emailSchema,
  password: passwordSchema,
});
export const magicLinkSchema = z.object({ email: emailSchema });

export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid({ message: 'Choose a size' }),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});
export const updateCartSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(10),
});

export const measurementsSchema = z.object({
  heightCm: z.coerce
    .number()
    .min(100)
    .max(230)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  bustCm: z.coerce
    .number()
    .min(50)
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  waistCm: z.coerce
    .number()
    .min(40)
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  hipsCm: z.coerce
    .number()
    .min(50)
    .max(220)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  fitNotes: optionalText(1000),
});

export const PRESET_QUESTIONS = [
  'What size should I get?',
  'Can you make this in another colour or fabric?',
  'Can you adjust the length or fit?',
  'When would this arrive by [date]?',
  'Can you send more photos or a video?',
  'I’d like something similar but custom.',
] as const;

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a message')
    .max(2000, 'Keep messages under 2000 characters'),
  imageUrls: z.array(z.string().max(500)).max(4).default([]),
});

export const startThreadSchema = messageSchema.extend({
  productId: z.string().uuid(),
  variantId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const reviewSchema = z.object({
  orderItemId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  title: optionalText(120),
  body: z.string().trim().min(10, 'Tell other shoppers a little more (10+ characters)').max(2000),
});

export const commissionRequestSchema = z
  .object({
    makerId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    sourceProductId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    garmentType: trimmed(80).min(2, 'What would you like made?'),
    occasion: optionalText(160),
    budgetMin: dollarsToCents,
    budgetMax: dollarsToCents,
    deadline: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine(
        (v) => !v || (!Number.isNaN(Date.parse(v)) && Date.parse(v) > Date.now()),
        'Choose a future date',
      ),
    measurements: optionalText(1000),
    fabricPreferences: optionalText(500),
    colourPreferences: optionalText(500),
    notes: optionalText(2000),
    inspirationImageUrls: z.array(z.string().max(500)).max(6).default([]),
  })
  .refine((v) => v.budgetMax >= v.budgetMin, {
    message: 'Maximum budget must be at least the minimum',
    path: ['budgetMax'],
  })
  .refine((v) => v.budgetMin >= 5_000, {
    message: 'Custom pieces start from A$50',
    path: ['budgetMin'],
  });

export const commissionQuoteSchema = z
  .object({
    requestId: z.string().uuid(),
    totalPrice: dollarsToCents,
    deposit: z.coerce
      .number()
      .min(0)
      .max(100_000)
      .transform((v) => Math.round(v * 100)),
    productionDays: z.coerce.number().int().min(1).max(180),
    revisionsIncluded: z.coerce.number().int().min(0).max(10),
    shipping: z.coerce
      .number()
      .min(0)
      .max(500)
      .transform((v) => Math.round(v * 100)),
    estimatedDeliveryDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Choose a date'),
    message: optionalText(2000),
  })
  .refine((v) => v.deposit <= v.totalPrice, {
    message: 'Deposit can’t exceed the total',
    path: ['deposit'],
  });

export const PRODUCT_CATEGORIES = [
  'dresses',
  'occasionwear',
  'skirts',
  'tops',
  'sets',
  'outerwear',
] as const;
export const PRODUCT_TYPES = ['ready_to_ship', 'made_to_order', 'one_of_one'] as const;

export const listingSchema = z
  .object({
    title: trimmed(120).min(3, 'Add a title'),
    description: trimmed(5000).min(20, 'Describe the piece (20+ characters)'),
    category: z.enum(PRODUCT_CATEGORIES),
    tags: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((t) =>
            t
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-'),
          )
          .filter(Boolean)
          .slice(0, 12),
      ),
    price: dollarsToCents,
    productType: z.enum(PRODUCT_TYPES),
    sizes: z.array(trimmed(12).min(1)).min(1, 'Add at least one size').max(12),
    colours: z.array(trimmed(30).min(1)).min(1, 'Add at least one colour').max(6),
    stock: z.coerce.number().int().min(0).max(999),
    fabricComposition: trimmed(200).min(2, 'Add the fabric composition'),
    careInstructions: trimmed(500).min(2, 'Add care instructions'),
    countryOfMaking: trimmed(60).default('Australia'),
    modelHeightCm: z.coerce
      .number()
      .int()
      .min(100)
      .max(230)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    modelSizeWorn: optionalText(12),
    leadTimeDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    madeToOrderOptions: optionalText(500),
    shippingPolicy: optionalText(500),
    measurements: z
      .array(z.object({ name: trimmed(40).min(1), valueCm: z.coerce.number().positive().max(300) }))
      .max(12)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.productType === 'made_to_order' && !v.leadTimeDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['leadTimeDays'],
        message: 'Made-to-order listings need a production lead time',
      });
    }
    if (v.productType === 'one_of_one') {
      if (v.stock !== 1)
        ctx.addIssue({
          code: 'custom',
          path: ['stock'],
          message: 'One-of-one pieces have a stock of exactly 1',
        });
      if (v.sizes.length !== 1 || v.colours.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['sizes'],
          message: 'One-of-one pieces have a single size and colour',
        });
      }
    }
  });

export const fulfilmentUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preparing'), fulfilmentId: z.string().uuid() }),
  z.object({
    action: z.literal('shipped'),
    fulfilmentId: z.string().uuid(),
    carrier: trimmed(60).min(2, 'Choose a carrier'),
    trackingNumber: trimmed(60).min(4, 'Add the tracking number'),
  }),
  z.object({ action: z.literal('delivered'), fulfilmentId: z.string().uuid() }),
]);

export const makerProfileSchema = z.object({
  displayName: trimmed(80).min(2),
  tagline: optionalText(160),
  story: optionalText(3000),
  process: optionalText(2000),
  materials: optionalText(2000),
  sizingNotes: optionalText(2000),
  city: trimmed(60).min(2),
  state: z.enum(['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']),
  leadTimeDays: z.coerce.number().int().min(0).max(120),
  dispatchDays: z.coerce.number().int().min(0).max(30),
  shippingStandard: z.coerce
    .number()
    .min(0)
    .max(200)
    .transform((v) => Math.round(v * 100)),
  freeShippingOver: z
    .union([z.literal(''), z.coerce.number().positive().max(10_000)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Math.round(v * 100))),
  customCommissionsEnabled: z
    .union([z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export const createSellerSchema = z.object({
  email: emailSchema,
  displayName: trimmed(80).min(2),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, 'Use lowercase letters, numbers and dashes'),
  city: trimmed(60).min(2),
  state: z.enum(['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']),
});

export const collectionSchema = z.object({
  id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, 'Use lowercase letters, numbers and dashes'),
  title: trimmed(120).min(2),
  subtitle: optionalText(200),
  description: optionalText(1000),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z
    .union([z.literal('on'), z.literal('')])
    .optional()
    .transform((v) => v === 'on'),
});

/** Turns a ZodError into { field: message } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type FormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string> }
  | undefined;
