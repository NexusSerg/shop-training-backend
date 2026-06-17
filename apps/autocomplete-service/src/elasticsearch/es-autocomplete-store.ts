/**
 * Elasticsearch completion-suggester store for product-name autocomplete — Step 3.4
 *
 * Uses the `name_suggest` completion field defined in the products index mapping
 * (see apps/search-service/src/elasticsearch/index-mapping.ts).
 *
 * The `name_suggest` field is populated during indexing with the product name
 * and carries a `weight` derived from the product's sales_rank so that popular
 * products surface first.
 */

import type { Client } from '@elastic/elasticsearch';
import type { Suggestion } from '@shop/shared-types';

const PRODUCTS_INDEX = 'products';

// Shape of a single option returned by the ES completion suggester
interface CompletionOption {
  _score: number;
  _source: {
    product_id?: string;
    name?: string;
    slug?: string;
    primary_image_url?: string;
  };
  text: string;
}

export class EsAutocompleteStore {
  constructor(private readonly client: Client) {}

  async getSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    const normalised = prefix.trim().toLowerCase();

    const response = await this.client.search({
      index: PRODUCTS_INDEX,
      _source: ['product_id', 'name', 'slug', 'primary_image_url'],
      suggest: {
        product_suggest: {
          prefix: normalised || ' ',
          completion: {
            field: 'name_suggest',
            size: limit,
            skip_duplicates: true,
            fuzzy: {
              fuzziness: 'AUTO',
              prefix_length: 1,
            },
          },
        },
      },
    } as Parameters<Client['search']>[0]);

    const suggestResult = (response as unknown as {
      suggest?: { product_suggest?: Array<{ options: CompletionOption[] }> };
    }).suggest;

    const options: CompletionOption[] =
      suggestResult?.product_suggest?.[0]?.options ?? [];

    return options.map((opt) => ({
      text: opt.text,
      type: 'product' as const,
      score: Math.round(opt._score * 100),
      ...(opt._source.product_id || opt._source.slug || opt._source.primary_image_url
        ? {
            payload: {
              ...(opt._source.product_id && { productId: opt._source.product_id }),
              ...(opt._source.slug && { slug: opt._source.slug }),
              ...(opt._source.primary_image_url && { imageUrl: opt._source.primary_image_url }),
            },
          }
        : {}),
    }));
  }
}
