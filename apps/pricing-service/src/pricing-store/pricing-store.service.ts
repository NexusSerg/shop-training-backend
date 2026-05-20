import { Injectable } from '@nestjs/common';
import { PricingStore } from '../mock/store';

@Injectable()
export class PricingStoreService extends PricingStore {}
