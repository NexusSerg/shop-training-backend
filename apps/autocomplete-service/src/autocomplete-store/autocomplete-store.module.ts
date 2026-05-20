import { Module } from '@nestjs/common';
import { AutocompleteStoreService } from './autocomplete-store.service';

@Module({
  providers: [AutocompleteStoreService],
  exports: [AutocompleteStoreService],
})
export class AutocompleteStoreModule {}
