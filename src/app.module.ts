import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicantsModule } from './applicants/applicants.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ApplicantsModule],
})
export class AppModule {}
