import { Module } from '@nestjs/common';
import { AutocompleteController } from './autocomplete.controller';
import { AutocompleteStoreModule } from '../autocomplete-store/autocomplete-store.module';

@Module({
  imports: [AutocompleteStoreModule],
  controllers: [AutocompleteController],
})
export class AutocompleteModule {}
