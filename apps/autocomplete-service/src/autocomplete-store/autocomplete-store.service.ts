import { Injectable } from '@nestjs/common';
import { AutocompleteStore } from '../mock/store';

@Injectable()
export class AutocompleteStoreService extends AutocompleteStore {}
