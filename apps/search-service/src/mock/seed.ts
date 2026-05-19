import { faker } from '@faker-js/faker';
import type { ProductSummary, ProductImage } from '@shop/shared-types';
import { slugify } from '@shop/shared-utils';

// ---------------------------------------------------------------------------
// Constants — mirrors the leaf categories from catalog-service
// ---------------------------------------------------------------------------

const LEAF_CATEGORIES: string[][] = [
  ['Electronics', 'Laptops'],
  ['Electronics', 'Phones'],
  ['Electronics', 'Headphones'],
  ['Electronics', 'Tablets'],
  ['Clothing', "Men's"],
  ['Clothing', "Women's"],
  ['Clothing', "Kids'"],
  ['Home & Kitchen', 'Appliances'],
  ['Home & Kitchen', 'Furniture'],
  ['Sports & Outdoors', 'Fitness'],
  ['Sports & Outdoors', 'Camping & Hiking'],
  ['Books', 'Fiction'],
  ['Books', 'Non-Fiction'],
];

const BRANDS = [
  'Apple',
  'Samsung',
  'Sony',
  'Nike',
  'Adidas',
  'Dell',
  'HP',
  'LG',
  'Bose',
  'Philips',
  'Reebok',
  'Under Armour',
  'Panasonic',
  'Lenovo',
  'ASUS',
];

const COLORS = ['Black', 'White', 'Silver', 'Blue', 'Red', 'Green', 'Grey', 'Navy'];
const MATERIALS = ['Plastic', 'Metal', 'Leather', 'Cotton', 'Polyester', 'Aluminium', 'Wood'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFakeProductSummary(): ProductSummary {
  const name = faker.commerce.productName();
  const brand = faker.helpers.arrayElement(BRANDS);
  const categoryPath = faker.helpers.arrayElement(LEAF_CATEGORIES);
  const slug = `${slugify(name)}-${faker.string.alphanumeric(6).toLowerCase()}`;

  // Pricing
  const originalPrice = parseFloat(faker.commerce.price({ min: 10, max: 2000 }));
  const hasDiscount = faker.datatype.boolean(0.4);
  const discountPercentage = hasDiscount ? faker.number.int({ min: 5, max: 60 }) : 0;
  const priceMin = hasDiscount
    ? parseFloat((originalPrice * (1 - discountPercentage / 100)).toFixed(2))
    : originalPrice;
  const priceMax = parseFloat(
    (priceMin + faker.number.float({ min: 0, max: 50, fractionDigits: 2 })).toFixed(2),
  );

  // Image
  const encoded = encodeURIComponent(name);
  const primaryImage: ProductImage = {
    url: `https://placehold.co/800x600?text=${encoded}`,
    altText: name,
    width: 800,
    height: 600,
    isPrimary: true,
  };

  // Attributes
  const attributes: Record<string, string | string[] | number> = {
    color: faker.helpers.arrayElement(COLORS),
    material: faker.helpers.arrayElement(MATERIALS),
    weight_kg: parseFloat(
      faker.number.float({ min: 0.1, max: 10, fractionDigits: 2 }).toFixed(2),
    ),
  };
  if (faker.datatype.boolean(0.6)) {
    attributes['size'] = faker.helpers.arrayElement(SIZES);
  }

  return {
    id: `p-${faker.string.uuid()}`,
    sku: faker.string.alphanumeric(8).toUpperCase(),
    name,
    slug,
    brand,
    categoryPath,
    primaryImage,
    priceMin,
    priceMax,
    originalPrice,
    discountPercentage,
    inStock: faker.datatype.boolean(0.85),
    sellerCount: faker.number.int({ min: 1, max: 10 }),
    ratingAvg: parseFloat(
      faker.number.float({ min: 1.0, max: 5.0, fractionDigits: 1 }).toFixed(1),
    ),
    reviewCount: faker.number.int({ min: 0, max: 10_000 }),
    attributes,
    createdAt: faker.date.past({ years: 2 }),
  };
}

/**
 * Generate a deterministic set of fake ProductSummary objects.
 * Uses a fixed seed so IDs are stable across restarts.
 */
export function seedProductSummaries(count = 100): ProductSummary[] {
  faker.seed(42);
  return Array.from({ length: count }, () => createFakeProductSummary());
}
