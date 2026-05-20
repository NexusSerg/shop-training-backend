import { Injectable } from '@nestjs/common';
import { CatalogStore } from '../mock/store';

@Injectable()
export class CatalogStoreService extends CatalogStore {}
