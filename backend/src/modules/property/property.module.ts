import { Module } from '@nestjs/common';
import { PropertyService } from './property.service';
import { PropertyController } from './property.controller';
import { FeeRatesService } from './fee-rates.service';

@Module({
  controllers: [PropertyController],
  providers: [PropertyService, FeeRatesService],
  exports: [PropertyService, FeeRatesService],
})
export class PropertyModule {}
