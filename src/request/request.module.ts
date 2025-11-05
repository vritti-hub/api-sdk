import { Global, Module } from '@nestjs/common';
import { RequestService } from './services/request.service';

@Global()
@Module({
  providers: [RequestService],
  exports: [RequestService],
})
export class RequestModule {}
