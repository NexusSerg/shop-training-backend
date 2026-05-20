import { Injectable } from '@nestjs/common';
import { SearchStore } from '../mock/store';

@Injectable()
export class SearchStoreService extends SearchStore {}
