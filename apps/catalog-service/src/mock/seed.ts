import { faker } from '@faker-js/faker';
import type { Product, ProductAttribute, ProductImage } from '@shop/shared-types';
import { slugify } from '@shop/shared-utils';
import { LEAF_CATEGORIES } from './categories';

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

function generateAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = [
    {
      key: 'color',
      value: faker.helpers.arrayElement(COLORS),
      label: 'Color',
      filterable: true,
      searchable: true,
    },
    {
      key: 'material',
      value: faker.helpers.arrayElement(MATERIALS),
      label: 'Material',
      filterable: true,
      searchable: false,
    },
    {
      key: 'weight_kg',
      value: parseFloat(faker.number.float({ min: 0.1, max: 10, fractionDigits: 2 }).toFixed(2)),
      label: 'Weight (kg)',
      filterable: false,
      searchable: false,
    },
  ];

  if (faker.datatype.boolean(0.6)) {
    attrs.push({
      key: 'size',
      value: faker.helpers.arrayElement(SIZES),
      label: 'Size',
      filterable: true,
      searchable: false,
    });
  }

  return attrs;
}

function generateImages(productName: string): ProductImage[] {
  const encoded = encodeURIComponent(productName);
  return [
    {
      url: `https://placehold.co/800x600?text=${encoded}`,
      altText: productName,
      width: 800,
      height: 600,
      isPrimary: true,
    },
    {
      url: `https://placehold.co/800x600?text=${encoded}+2`,
      altText: `${productName} — alternate view`,
      width: 800,
      height: 600,
      isPrimary: false,
    },
  ];
}

export function createFakeProduct(): Product {
  const name = faker.commerce.productName();
  const brand = faker.helpers.arrayElement(BRANDS);
  const category = faker.helpers.arrayElement(LEAF_CATEGORIES);
  const slug = `${slugify(name)}-${faker.string.alphanumeric(6).toLowerCase()}`;
  const createdAt = faker.date.past({ years: 2 });
  const updatedAt = faker.date.between({ from: createdAt, to: new Date() });

  const status = faker.helpers.weightedArrayElement([
    { value: 'active' as const, weight: 85 },
    { value: 'inactive' as const, weight: 10 },
    { value: 'draft' as const, weight: 5 },
  ]);

  return {
    id: `p-${faker.string.uuid()}`,
    sku: faker.string.alphanumeric(8).toUpperCase(),
    name,
    description: faker.commerce.productDescription(),
    brand,
    slug,
    status,
    categoryId: category.id,
    categoryPath: category.path,
    attributes: generateAttributes(),
    images: generateImages(name),
    metaTitle: `${name} — ${brand}`,
    metaDescription: `Buy ${name} from ${brand}. Best prices and fast delivery.`,
    createdAt,
    updatedAt,
  };
}

/**
 * Generate a deterministic set of fake products.
 * Uses a fixed seed so product IDs are stable across restarts (good for local dev & tests).
 */
export function seedProducts(count = 100): Product[] {
  faker.seed(42);
  return Array.from({ length: count }, () => createFakeProduct());
}
