import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountModule } from '../account/account.module';
import { DepositModule } from '../deposit/deposit.module';
import { MatchmakerModule } from '../matchmaker/matchmaker.module';
import { PropertyModule } from '../property/property.module';
import { AdminSupportController, ChatSupportController } from './chat-support.controller';
import { ChatSupportService } from './chat-support.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, MatchmakerModule, PropertyModule, DepositModule, AccountModule],
  controllers: [ChatController, ChatSupportController, AdminSupportController],
  providers: [ChatService, ChatSupportService],
})
export class ChatModule {}
