import { Module } from '@nestjs/common';
import { AutocompleteStoreService } from './autocomplete-store.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [AutocompleteStoreService],
  exports: [AutocompleteStoreService],
})
export class AutocompleteStoreModule {}
